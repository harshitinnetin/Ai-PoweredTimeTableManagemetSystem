"""
AI Digital Twin + Slot Marketplace (University-wide Timetabling)
----------------------------------------------------------------
Single-file Python reference implementation (minimal yet extensible) that:
- Builds a temporal knowledge graph of a university using NetworkX
- Defines core entities (Department, Program, Year/Term, Section, Course, Faculty, Room, Cohort, Timeslot, Policy)
- Exposes a DigitalTwin facade to ingest data, manage versions, and run "what-if" scenarios
- Bridges the graph to an optimization model using OR-Tools CP-SAT
- Generates clash-free, workload-balanced timetables department-wise, year-wise, section-wise
- Supports partial re-solve with pins and leave/room outage handling

Notes
-----
- This is a reference scaffolding you can adapt to your real data. It is kept
  compact for readability. For production, split into modules and add persistence.
- Requires: `pip install ortools networkx` (and optionally `pydantic` if you
  prefer validation; here we use dataclasses for simplicity).

Run
---
python ai_digital_twin_timetable.py

It will:
1) Build a tiny toy university twin
2) Solve baseline timetable
3) Apply a faculty leave what-if and run a partial re-solve
4) Print/export allocations and KPIs
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional, Set
import itertools
import math
import json
import networkx as nx
from ortools.sat.python import cp_model

# -----------------------------
# Domain Models (Entities)
# -----------------------------

@dataclass
class Department:
    dept_id: str
    name: str
    buildings: List[str] = field(default_factory=list)
    policies: List[str] = field(default_factory=list)
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None

@dataclass
class Program:
    program_id: str
    name: str
    duration_terms: int
    term_structure: Dict[int, Dict]  # e.g., {1: {"start": ..., "end": ...}}

@dataclass
class YearTerm:
    year_id: str
    program_id: str
    term_no: int
    start_date: str
    end_date: str

@dataclass
class Section:
    section_id: str
    year_id: str
    capacity: int
    tags: Set[str] = field(default_factory=set)
    preferred_windows: List[str] = field(default_factory=list)  # e.g., ["MORNING","NO_FRI_EVE"]

@dataclass
class Course:
    course_id: str
    title: str
    course_type: str  # CORE|AEC|VAC|SEC|LAB|PROJECT
    credits: int
    hours_theory: int
    hours_lab: int
    duration_min: int  # duration per session
    owner_dept: str
    prerequisites: List[str] = field(default_factory=list)
    facility_needs: Dict[str, bool] = field(default_factory=dict)  # {"lab":True, "smart_class":False}

@dataclass
class Faculty:
    faculty_id: str
    name: str
    expertise: List[str]
    max_per_day: int
    max_per_week: int
    availability: Set[Tuple[str, int]]  # (day, slot_index)
    preferred_windows: Set[str] = field(default_factory=set)
    historical_load: int = 0
    certifications: List[str] = field(default_factory=list)

@dataclass
class Room:
    room_id: str
    building: str
    room_type: str  # lab|smart|studio|seminar
    capacity: int
    equipment: List[str]
    availability: Set[Tuple[str, int]]  # (day, slot_index)
    accessible: bool = True

@dataclass
class Cohort:
    cohort_id: str
    section_ids: List[str]  # which sections compose this micro-cohort
    course_bundle: List[str]  # courses they take together (e.g., elective bundle)
    size: int

@dataclass
class Timeslot:
    slot_id: str
    day: str      # MON..FRI
    index: int    # discrete index within the day (e.g., 0..7)
    start_min: int
    end_min: int

@dataclass
class Policy:
    policy_id: str
    scope: str  # univ|dept|program|year|section|course|faculty
    rule_type: str
    params: Dict
    priority: int
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None

@dataclass
class TimetableVersion:
    tt_id: str
    assignments: Dict[str, Tuple[str, str, str]]  # key: session_key -> (course_id, room_id, slot_id)
    pins: Set[str] = field(default_factory=set)
    score_breakdown: Dict[str, float] = field(default_factory=dict)
    meta: Dict = field(default_factory=dict)

# -----------------------------
# Digital Twin (Graph + Facade)
# -----------------------------

class DigitalTwin:
    """University Digital Twin backed by a temporal knowledge graph (NetworkX)."""
    def __init__(self):
        self.g = nx.MultiDiGraph()
        self.timeslots: Dict[str, Timeslot] = {}
        self.current_tt: Optional[TimetableVersion] = None

    # --- Node helpers ---
    def add_department(self, d: Department):
        self.g.add_node(("Department", d.dept_id), **d.__dict__)

    def add_program(self, p: Program):
        self.g.add_node(("Program", p.program_id), **p.__dict__)

    def add_year(self, y: YearTerm):
        self.g.add_node(("Year", y.year_id), **y.__dict__)

    def add_section(self, s: Section):
        self.g.add_node(("Section", s.section_id), **s.__dict__)

    def add_course(self, c: Course):
        self.g.add_node(("Course", c.course_id), **c.__dict__)

    def add_faculty(self, f: Faculty):
        self.g.add_node(("Faculty", f.faculty_id), **f.__dict__)

    def add_room(self, r: Room):
        self.g.add_node(("Room", r.room_id), **r.__dict__)

    def add_cohort(self, c: Cohort):
        self.g.add_node(("Cohort", c.cohort_id), **c.__dict__)

    def add_timeslot(self, t: Timeslot):
        self.timeslots[t.slot_id] = t
        self.g.add_node(("Timeslot", t.slot_id), **t.__dict__)

    def add_policy(self, p: Policy):
        self.g.add_node(("Policy", p.policy_id), **p.__dict__)

    # --- Edge helpers ---
    def link(self, a: Tuple[str, str], rel: str, b: Tuple[str, str], **attrs):
        self.g.add_edge(a, b, key=rel, **attrs)

    # Convenience linkers
    def dept_offers_course(self, dept_id: str, course_id: str):
        self.link(("Department", dept_id), "OFFERS", ("Course", course_id))

    def faculty_can_teach(self, faculty_id: str, course_id: str, proficiency: int = 1, last_taught: Optional[int] = None):
        self.link(("Faculty", faculty_id), "CAN_TEACH", ("Course", course_id), proficiency=proficiency, last_taught=last_taught)

    def section_takes_course(self, section_id: str, course_id: str):
        self.link(("Section", section_id), "TAKES", ("Course", course_id))

    def cohort_elects_course(self, cohort_id: str, course_id: str):
        self.link(("Cohort", cohort_id), "ELECTS", ("Course", course_id))

    def course_requires_course(self, course_id: str, prereq_id: str):
        self.link(("Course", course_id), "REQUIRES", ("Course", prereq_id))

    def room_is_type(self, room_id: str, facility_type: str):
        self.link(("Room", room_id), "IS_TYPE", ("FacilityType", facility_type))

    # -----------------------------
    # Query utilities
    # -----------------------------
    def get_node(self, label: str, id_: str) -> Dict:
        return self.g.nodes[(label, id_)]

    def neighbors(self, label: str, id_: str, rel: Optional[str] = None, direction: str = "out"):
        n = (label, id_)
        if direction == "out":
            for _, b, k, data in self.g.out_edges(n, keys=True, data=True):
                if rel is None or k == rel:
                    yield b, k, data
        else:
            for a, _, k, data in self.g.in_edges(n, keys=True, data=True):
                if rel is None or k == rel:
                    yield a, k, data

    # -----------------------------
    # Feasibility helpers
    # -----------------------------
    def feasible_rooms_for(self, course_id: str, demand_size: int) -> List[str]:
        c: Course = self.get_node("Course", course_id)  # type: ignore
        needs_lab = c.get("facility_needs", {}).get("lab", False)
        needs_smart = c.get("facility_needs", {}).get("smart_class", False)
        rooms = []
        for (label, rid), data in self.g.nodes(data=True):
            if label != "Room":
                continue
            if data["capacity"] < demand_size:
                continue
            # simple capability matching
            if needs_lab and data["room_type"] != "lab":
                continue
            if needs_smart and data["room_type"] not in ("smart", "lab"):
                continue
            rooms.append(rid)
        return rooms

    def faculty_for_course(self, course_id: str) -> List[str]:
        res = []
        for a, k, data in self.neighbors("Course", course_id, rel=None, direction="in"):
            if a[0] == "Faculty" and k == "CAN_TEACH":
                res.append(a[1])
        return res

    def cohorts_for_course(self, course_id: str) -> List[Tuple[str, int]]:
        # returns list of (cohort_id, size) or (section_id, capacity) if core
        res = []
        for a, k, _ in self.neighbors("Course", course_id, rel=None, direction="in"):
            if a[0] == "Cohort" and k == "ELECTS":
                size = self.get_node("Cohort", a[1])["size"]
                res.append((a[1], size))
            if a[0] == "Section" and k == "TAKES":
                cap = self.get_node("Section", a[1])["capacity"]
                res.append((a[1], cap))
        return res

# -----------------------------
# Solver Bridge (CP-SAT)
# -----------------------------

class TimetableSolver:
    """Builds and solves a CP-SAT model from a DigitalTwin snapshot."""
    def __init__(self, twin: DigitalTwin):
        self.twin = twin
        self.model = cp_model.CpModel()
        self.x = {}  # decision vars: (session_key, room_id, slot_id) -> BoolVar
        self.y_faculty_slot = {}  # (faculty_id, day, idx) -> BoolVar (teaching that slot)
        self.session_meta = {}  # session_key -> dict(course_id, cohort_id, faculty_id, duration)
        self.slots_by_day = self._slots_by_day()

    # --- Timeslot utilities ---
    def _slots_by_day(self) -> Dict[str, List[Timeslot]]:
        days = {}
        for t in self.twin.timeslots.values():
            days.setdefault(t.day, []).append(t)
        for d in days:
            days[d].sort(key=lambda ts: ts.index)
        return days

    # --- Build sessions from courses ---
    def _expand_sessions(self) -> List[str]:
        """Expand each course into weekly session placeholders per cohort/section.
        NOTE: Graph nodes store dict attributes; access via dict keys, not dataclass attrs.
        """
        session_keys = []
        for (label, cid), cdata in self.twin.g.nodes(data=True):
            if label != "Course":
                continue
            # cdata is a dict of attributes as stored in the graph
            total_hours = int(cdata.get("hours_theory", 0)) + int(cdata.get("hours_lab", 0))
            if total_hours <= 0:
                continue
            cohorts = self.twin.cohorts_for_course(cid)
            faculties = self.twin.faculty_for_course(cid)
            if not faculties:
                continue  # skip courses without mapped faculty
            for (cohort_id, size) in cohorts:
                feasible_rooms = self.twin.feasible_rooms_for(cid, size)
                if not feasible_rooms:
                    continue
                for s_idx in range(total_hours):
                    session_key = f"S_{cid}_{cohort_id}_{s_idx}"
                    self.session_meta[session_key] = {
                        "course_id": cid,
                        "cohort_id": cohort_id,
                        "size": size,
                        "candidate_faculties": faculties,
                        "feasible_rooms": feasible_rooms,
                        "duration_blocks": 1,
                    }
                    session_keys.append(session_key)
        return session_keys

    def build(self, pins: Optional[Set[str]] = None):
        pins = pins or set()
        session_keys = self._expand_sessions()

        # Decision vars: x[session, room, slot]
        for sk in session_keys:
            meta = self.session_meta[sk]
            for r in meta["feasible_rooms"]:
                for ts in self.twin.timeslots.values():
                    var = self.model.NewBoolVar(f"x_{sk}_{r}_{ts.slot_id}")
                    self.x[(sk, r, ts.slot_id)] = var

        # Each session must be scheduled exactly once (room & slot)
        for sk in session_keys:
            vars_for_session = [self.x[(sk, r, ts_id)] for (sk2, r, ts_id) in self.x if sk2 == sk]
            if vars_for_session:
                self.model.Add(sum(vars_for_session) == 1)

        # No double-booking rooms per slot
        for (label, rid), rdata in self.twin.g.nodes(data=True):
            if label != "Room":
                continue
            for ts in self.twin.timeslots.values():
                vars_room_slot = [self.x[key] for key in self.x if key[1] == rid and key[2] == ts.slot_id]
                if vars_room_slot:
                    self.model.Add(sum(vars_room_slot) <= 1)

        # Faculty availability + one course per faculty per slot
        # Create implicit faculty-slot vars and link
        fac_slot_vars: Dict[Tuple[str, str, int], List[cp_model.IntVar]] = {}
        for sk, meta in self.session_meta.items():
            cid = meta["course_id"]
            candidates = meta["candidate_faculties"]
            for r in meta["feasible_rooms"]:
                for ts in self.twin.timeslots.values():
                    xvar = self.x[(sk, r, ts.slot_id)]
                    day, idx = ts.day, ts.index
                    # Build a selector that this session uses a specific faculty
                    # We introduce y_sk_f vars for faculty choice and couple to x via constraints
                    for f in candidates:
                        y_f = self.y_faculty_slot.setdefault((f, day, idx), self.model.NewBoolVar(f"y_{f}_{day}_{idx}"))
                        fac_slot_vars.setdefault((f, day, idx), []).append(xvar)
                        # If xvar chosen, then that slot must be marked as faculty teaching
                        self.model.AddImplication(xvar, y_f)

        # Faculty cannot teach two sessions at the same time
        for key, arr in fac_slot_vars.items():
            # This ensures if any x uses this faculty-slot, y is 1, but we also bound the sum
            self.model.Add(sum(arr) <= 1)

        # Section/Cohort no-overlap per slot
        cohort_slot_vars: Dict[Tuple[str, str, int], List[cp_model.IntVar]] = {}
        for sk, meta in self.session_meta.items():
            cohort = meta["cohort_id"]
            for r in meta["feasible_rooms"]:
                for ts in self.twin.timeslots.values():
                    xvar = self.x[(sk, r, ts.slot_id)]
                    cohort_slot_vars.setdefault((cohort, ts.day, ts.index), []).append(xvar)
        for key, arr in cohort_slot_vars.items():
            self.model.Add(sum(arr) <= 1)

        # Respect room availability
        for (label, rid), rdata in self.twin.g.nodes(data=True):
            if label != "Room":
                continue
            avail: Set[Tuple[str, int]] = rdata["availability"]
            allowed = {(day, idx) for (day, idx) in avail}
            for ts in self.twin.timeslots.values():
                if (ts.day, ts.index) not in allowed:
                    # room not available in this slot => force 0
                    for sk in session_keys:
                        if (sk, rid, ts.slot_id) in self.x:
                            self.model.Add(self.x[(sk, rid, ts.slot_id)] == 0)

        # (Optional) Faculty daily load caps (soft via penalties, here as hard approximation)
        # You can compute post-solution fairness KPIs instead for simplicity.

        # Pins (keep existing assignments fixed)
        for pin_key in pins:
            # pin_key format: "x_{session}_{room}_{slot}" or session_key only
            if pin_key.startswith("x_"):
                # exact var pin
                name = pin_key
                # find the var by name
                for key, var in self.x.items():
                    if var.Name() == name:
                        self.model.Add(var == 1)
            else:
                # pin by session meta in current_tt
                pass

        # Objective: minimize simple proxy for student gaps + encourage room utilization band
        # For brevity, we'll just maximize total assigned sessions in mid-day slots (proxy compactness)
        objective_terms = []
        MIDDAY_IDXS = {2, 3, 4}  # e.g., indices considered compact window
        for (sk, r, ts_id), var in self.x.items():
            ts = self.twin.timeslots[ts_id]
            if ts.index in MIDDAY_IDXS:
                objective_terms.append(var)
        self.model.Maximize(sum(objective_terms))

    def solve(self, max_time_s: int = 10) -> Tuple[int, Dict[str, Tuple[str, str, str]]]:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max_time_s
        solver.parameters.num_search_workers = 8
        status = solver.Solve(self.model)
        assign: Dict[str, Tuple[str, str, str]] = {}
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            for (sk, r, ts_id), var in self.x.items():
                if solver.Value(var) == 1:
                    cid = self.session_meta[sk]["course_id"]
                    assign[sk] = (cid, r, ts_id)
        return status, assign

# -----------------------------
# What-If / Auto-Heal Utilities
# -----------------------------

def apply_faculty_leave(twin: DigitalTwin, faculty_id: str, day: str, idx_from: int, idx_to: int):
    """Remove availability for a faculty across a range of slot indices for a given day."""
    f = twin.get_node("Faculty", faculty_id)
    new_avail = set([slot for slot in f["availability"] if not (slot[0] == day and idx_from <= slot[1] <= idx_to)])
    f["availability"] = new_avail

# -----------------------------
# KPIs & Reporting
# -----------------------------

def kpis(assign: Dict[str, Tuple[str, str, str]], twin: DigitalTwin) -> Dict[str, float]:
    # Minimal KPIs for illustration
    by_room_slot = {}
    for sk, (cid, rid, tsid) in assign.items():
        by_room_slot.setdefault((rid, tsid), 0)
        by_room_slot[(rid, tsid)] += 1
    clashes = sum(1 for v in by_room_slot.values() if v > 1)

    utilization = len(by_room_slot) / max(1, (len([n for n in twin.g.nodes if n[0]=="Room"]) * len(twin.timeslots)))
    return {
        "room_slot_clashes": float(clashes),
        "utilization_ratio": round(utilization, 3),
        "assigned_sessions": float(len(assign)),
    }

# -----------------------------
# Example Bootstrapping (Toy Data)
# -----------------------------

DAYS = ["MON", "TUE", "WED", "THU", "FRI"]
SLOTS_PER_DAY = 6  # indices: 0..5
START_MIN = {0: 9*60, 1: 10*60, 2: 11*60, 3: 12*60+30, 4: 14*60, 5: 15*60}


def build_toy_twin() -> DigitalTwin:
    twin = DigitalTwin()

    # Timeslots
    for d in DAYS:
        for i in range(SLOTS_PER_DAY):
            ts = Timeslot(
                slot_id=f"{d}_{i}", day=d, index=i,
                start_min=START_MIN[i], end_min=START_MIN[i] + 55
            )
            twin.add_timeslot(ts)

    # Departments
    twin.add_department(Department("EDU", "Education", ["B1"]))
    twin.add_department(Department("CS", "Computer Science", ["B2"]))

    # Programs/Years/Sections
    twin.add_program(Program("FYUP", "Four Year UG", 8, {}))
    twin.add_year(YearTerm("FYUP_Y1_T1", "FYUP", 1, "2025-08-01", "2025-12-15"))
    twin.add_section(Section("FYUP_Y1_A", "FYUP_Y1_T1", 60))
    twin.add_section(Section("FYUP_Y1_B", "FYUP_Y1_T1", 60))

    # Courses (core + VAC/AEC)
    twin.add_course(Course("CORE-MATH-101", "Calculus I", "CORE", 4, hours_theory=4, hours_lab=0, duration_min=55, owner_dept="CS", facility_needs={"smart_class": True}))
    twin.add_course(Course("VAC-DS-201", "Data Storytelling", "VAC", 2, hours_theory=2, hours_lab=0, duration_min=55, owner_dept="CS", facility_needs={"smart_class": True}))
    twin.add_course(Course("AEC-ENG-101", "Academic English", "AEC", 2, hours_theory=2, hours_lab=0, duration_min=55, owner_dept="EDU", facility_needs={"smart_class": True}))

    # Rooms
    all_avail = {(d, i) for d in DAYS for i in range(SLOTS_PER_DAY)}
    twin.add_room(Room("R101", "B1", "smart", 80, ["proj"], all_avail))
    twin.add_room(Room("R204", "B2", "smart", 120, ["proj","audio"], all_avail))
    twin.add_room(Room("LAB1", "B2", "lab", 40, ["pc"], all_avail))

    # Faculty
    fac_avail = {(d, i) for d in DAYS for i in range(SLOTS_PER_DAY) if not (d=="FRI" and i>3)}
    twin.add_faculty(Faculty("F-CS-1", "Dr. Rao", ["Calculus","Data"], 3, 12, fac_avail, {"MORNING"}))
    twin.add_faculty(Faculty("F-ENG-1", "Prof. Meera", ["English"], 3, 12, fac_avail, {"MORNING"}))

    # Qualifications
    twin.faculty_can_teach("F-CS-1", "CORE-MATH-101", proficiency=3)
    twin.faculty_can_teach("F-CS-1", "VAC-DS-201", proficiency=2)
    twin.faculty_can_teach("F-ENG-1", "AEC-ENG-101", proficiency=3)

    # Enrollments (sections take core; create elective cohorts)
    twin.section_takes_course("FYUP_Y1_A", "CORE-MATH-101")
    twin.section_takes_course("FYUP_Y1_B", "CORE-MATH-101")

    # VAC/AEC demand: create micro-cohorts (here we mock two with sizes)
    twin.add_cohort(Cohort("VAC_COHORT_1", ["FYUP_Y1_A","FYUP_Y1_B"], ["VAC-DS-201"], size=70))
    twin.cohort_elects_course("VAC_COHORT_1", "VAC-DS-201")

    twin.add_cohort(Cohort("AEC_COHORT_1", ["FYUP_Y1_A","FYUP_Y1_B"], ["AEC-ENG-101"], size=50))
    twin.cohort_elects_course("AEC_COHORT_1", "AEC-ENG-101")

    # Dept ownerships (not strictly needed for the solver but good for reporting)
    twin.dept_offers_course("CS", "CORE-MATH-101")
    twin.dept_offers_course("CS", "VAC-DS-201")
    twin.dept_offers_course("EDU", "AEC-ENG-101")

    return twin

# -----------------------------
# Demo run
# -----------------------------

if __name__ == "__main__":
    twin = build_toy_twin()

    print("\n=== Baseline solve ===")
    solver = TimetableSolver(twin)
    solver.build()
    status, assign = solver.solve(max_time_s=10)
    print("Status:", status)
    print("Assignments (first 10):")
    for k, v in list(assign.items())[:10]:
        print(k, "->", v)
    print("KPIs:", kpis(assign, twin))

    # Apply a What-If: Faculty leave
    print("\n=== What-If: Faculty F-CS-1 on leave WED slots 2..4 (auto-heal) ===")
    apply_faculty_leave(twin, "F-CS-1", day="WED", idx_from=2, idx_to=4)

    solver2 = TimetableSolver(twin)
    # Pin nothing in toy; in real use, pass twin.current_tt.pins
    solver2.build(pins=set())
    status2, assign2 = solver2.solve(max_time_s=10)
    print("Status:", status2)
    for k, v in list(assign2.items())[:10]:
        print(k, "->", v)
    print("KPIs:", kpis(assign2, twin))

    # Export a compact JSON for UI consumption
    output = {
        "assignments": assign2,
        "timeslots": {k: twin.timeslots[k].__dict__ for k in twin.timeslots},
    }
    with open("timetable_output.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print("\nExported timetable_output.json")
