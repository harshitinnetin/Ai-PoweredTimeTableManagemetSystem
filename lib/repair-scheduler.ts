import type { SchedulerData, Assignment, Event, RepairPlan, Day } from "./types"

interface RepairContext {
  data: SchedulerData
  assignments: Assignment[]
  occupancy: Map<string, Set<string>> // "day-slot" -> Set of occupied resources
  events: Event[]
  scope?: { department?: string | "ALL"; year?: number | "ALL" }
}

interface Candidate {
  assignment: Assignment
  newDay: Day
  newSlot: number
  newRoomId: string
  newFacultyId: string
  cost: number
  reason: string
}

export function generateRepairPlans(
  data: SchedulerData,
  currentAssignments: Assignment[],
  events: Event[],
  scope?: { department?: string | "ALL"; year?: number | "ALL" },
  k = 5,
): RepairPlan[] {
  const context: RepairContext = {
    data,
    assignments: currentAssignments,
    occupancy: buildOccupancyMap(currentAssignments),
    events,
    scope,
  }

  const impactedAssignments = findImpactedAssignments(context)

  if (impactedAssignments.length === 0) {
    return []
  }

  const plans: RepairPlan[] = []

  // Strategy A: Room-first (try to keep faculty and time, change room)
  const roomFirstPlan = generateRoomFirstPlan(context, impactedAssignments)
  if (roomFirstPlan) plans.push(roomFirstPlan)

  // Strategy B: Faculty-first (try to keep room and time, change faculty)
  const facultyFirstPlan = generateFacultyFirstPlan(context, impactedAssignments)
  if (facultyFirstPlan) plans.push(facultyFirstPlan)

  // Strategy C: Time-first (try to keep faculty and room, change time)
  const timeFirstPlan = generateTimeFirstPlan(context, impactedAssignments)
  if (timeFirstPlan) plans.push(timeFirstPlan)

  // Strategy D: Minimal disruption (best overall combination)
  const minimalDisruptionPlan = generateMinimalDisruptionPlan(context, impactedAssignments)
  if (minimalDisruptionPlan) plans.push(minimalDisruptionPlan)

  const scoredPlans = plans
    .map((plan) => ({ ...plan, score: scorePlan(plan, context) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, k)

  return scoredPlans
}

function buildOccupancyMap(assignments: Assignment[]): Map<string, Set<string>> {
  const occupancy = new Map<string, Set<string>>()

  assignments.forEach((assignment) => {
    const key = `${assignment.day}-${assignment.slotIndex}`
    if (!occupancy.has(key)) {
      occupancy.set(key, new Set())
    }
    const occupied = occupancy.get(key)!
    occupied.add(`room-${assignment.roomId}`)
    occupied.add(`faculty-${assignment.facultyId}`)
    occupied.add(`batch-${assignment.batchId}`)
  })

  return occupancy
}

function findImpactedAssignments(context: RepairContext): Assignment[] {
  const impacted: Assignment[] = []

  context.events.forEach((event) => {
    context.assignments.forEach((assignment) => {
      let isImpacted = false

      if (event.type === "facultyLeave" && assignment.facultyId === event.facultyId) {
        // Check if assignment falls within the leave period
        if (!event.days || event.days.includes(assignment.day)) {
          if (!event.slots || event.slots.includes(assignment.slotIndex)) {
            isImpacted = true
          }
        }
      }

      if (event.type === "roomUnavailable" && assignment.roomId === event.roomId) {
        // Check if assignment falls within the unavailable period
        if (!event.days || event.days.includes(assignment.day)) {
          if (!event.slots || event.slots.includes(assignment.slotIndex)) {
            isImpacted = true
          }
        }
      }

      if (event.type === "capacityChange" && assignment.roomId === event.roomId) {
        const batch = context.data.batches.find((b) => b.id === assignment.batchId)
        if (batch && batch.size > (event.newCapacity || 0)) {
          isImpacted = true
        }
      }

      if (isImpacted && !impacted.find((a) => a.id === assignment.id)) {
        impacted.push(assignment)
      }
    })
  })

  console.log("[v0] Found impacted assignments:", impacted.length)
  console.log("[v0] Events causing impact:", context.events)

  return impacted
}

function generateRoomFirstPlan(context: RepairContext, impacted: Assignment[]): RepairPlan | null {
  const moves: RepairPlan["moves"] = []
  const substitutions: RepairPlan["substitutions"] = []

  for (const assignment of impacted) {
    const candidate = findBestRoomCandidate(assignment, context)
    if (candidate) {
      moves.push({
        batchId: assignment.batchId,
        courseCode: assignment.courseCode,
        from: {
          day: assignment.day,
          slotIndex: assignment.slotIndex,
          roomId: assignment.roomId,
          facultyId: assignment.facultyId,
        },
        to: {
          day: candidate.newDay,
          slotIndex: candidate.newSlot,
          roomId: candidate.newRoomId,
          facultyId: candidate.newFacultyId,
        },
      })

      if (assignment.facultyId !== candidate.newFacultyId) {
        substitutions.push({
          facultyFrom: assignment.facultyId,
          facultyTo: candidate.newFacultyId,
        })
      }
    }
  }

  if (moves.length === 0) return null

  return {
    planId: "room-first",
    score: 0, // Will be calculated later
    explanation: "Prioritizes keeping original time slots, changes rooms when needed",
    moves,
    substitutions,
    sideEffects: [],
    metricsDelta: { clashCount: 0, roomUtil: 0, batchGaps: 0, facultyLoadStdev: 0 },
  }
}

function generateFacultyFirstPlan(context: RepairContext, impacted: Assignment[]): RepairPlan | null {
  const moves: RepairPlan["moves"] = []
  const substitutions: RepairPlan["substitutions"] = []

  for (const assignment of impacted) {
    const candidate = findBestFacultyCandidate(assignment, context)
    if (candidate) {
      moves.push({
        batchId: assignment.batchId,
        courseCode: assignment.courseCode,
        from: {
          day: assignment.day,
          slotIndex: assignment.slotIndex,
          roomId: assignment.roomId,
          facultyId: assignment.facultyId,
        },
        to: {
          day: candidate.newDay,
          slotIndex: candidate.newSlot,
          roomId: candidate.newRoomId,
          facultyId: candidate.newFacultyId,
        },
      })

      if (assignment.facultyId !== candidate.newFacultyId) {
        substitutions.push({
          facultyFrom: assignment.facultyId,
          facultyTo: candidate.newFacultyId,
        })
      }
    }
  }

  if (moves.length === 0) return null

  return {
    planId: "faculty-first",
    score: 0,
    explanation: "Prioritizes finding substitute faculty, keeps rooms and times when possible",
    moves,
    substitutions,
    sideEffects: [],
    metricsDelta: { clashCount: 0, roomUtil: 0, batchGaps: 0, facultyLoadStdev: 0 },
  }
}

function generateTimeFirstPlan(context: RepairContext, impacted: Assignment[]): RepairPlan | null {
  const moves: RepairPlan["moves"] = []
  const substitutions: RepairPlan["substitutions"] = []

  for (const assignment of impacted) {
    const candidate = findBestTimeCandidate(assignment, context)
    if (candidate) {
      moves.push({
        batchId: assignment.batchId,
        courseCode: assignment.courseCode,
        from: {
          day: assignment.day,
          slotIndex: assignment.slotIndex,
          roomId: assignment.roomId,
          facultyId: assignment.facultyId,
        },
        to: {
          day: candidate.newDay,
          slotIndex: candidate.newSlot,
          roomId: candidate.newRoomId,
          facultyId: candidate.newFacultyId,
        },
      })

      if (assignment.facultyId !== candidate.newFacultyId) {
        substitutions.push({
          facultyFrom: assignment.facultyId,
          facultyTo: candidate.newFacultyId,
        })
      }
    }
  }

  if (moves.length === 0) return null

  return {
    planId: "time-first",
    score: 0,
    explanation: "Moves sessions to nearby time slots, keeps faculty and rooms when possible",
    moves,
    substitutions,
    sideEffects: [],
    metricsDelta: { clashCount: 0, roomUtil: 0, batchGaps: 0, facultyLoadStdev: 0 },
  }
}

function generateMinimalDisruptionPlan(context: RepairContext, impacted: Assignment[]): RepairPlan | null {
  const moves: RepairPlan["moves"] = []
  const substitutions: RepairPlan["substitutions"] = []

  for (const assignment of impacted) {
    const candidates = generateAllCandidates(assignment, context)
    const bestCandidate = candidates.sort((a, b) => a.cost - b.cost)[0]

    if (bestCandidate) {
      moves.push({
        batchId: assignment.batchId,
        courseCode: assignment.courseCode,
        from: {
          day: assignment.day,
          slotIndex: assignment.slotIndex,
          roomId: assignment.roomId,
          facultyId: assignment.facultyId,
        },
        to: {
          day: bestCandidate.newDay,
          slotIndex: bestCandidate.newSlot,
          roomId: bestCandidate.newRoomId,
          facultyId: bestCandidate.newFacultyId,
        },
      })

      if (assignment.facultyId !== bestCandidate.newFacultyId) {
        substitutions.push({
          facultyFrom: assignment.facultyId,
          facultyTo: bestCandidate.newFacultyId,
        })
      }
    }
  }

  if (moves.length === 0) return null

  return {
    planId: "minimal-disruption",
    score: 0,
    explanation: "Optimizes for minimal overall disruption across all constraints",
    moves,
    substitutions,
    sideEffects: [],
    metricsDelta: { clashCount: 0, roomUtil: 0, batchGaps: 0, facultyLoadStdev: 0 },
  }
}

function findBestRoomCandidate(assignment: Assignment, context: RepairContext): Candidate | null {
  const candidates: Candidate[] = []
  const days: Day[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

  // Try same time slot, different rooms
  const key = `${assignment.day}-${assignment.slotIndex}`
  const occupied = context.occupancy.get(key) || new Set()

  context.data.rooms.forEach((room) => {
    if (room.id === assignment.roomId) return // Skip current room
    if (occupied.has(`room-${room.id}`)) return // Room is occupied

    const batch = context.data.batches.find((b) => b.id === assignment.batchId)
    if (!batch || room.capacity < batch.size) return // Room too small

    candidates.push({
      assignment,
      newDay: assignment.day,
      newSlot: assignment.slotIndex,
      newRoomId: room.id,
      newFacultyId: assignment.facultyId,
      cost: 10, // Room change cost
      reason: "Room change",
    })
  })

  console.log("[v0] Room candidates found:", candidates.length)

  return candidates.sort((a, b) => a.cost - b.cost)[0] || null
}

function findBestFacultyCandidate(assignment: Assignment, context: RepairContext): Candidate | null {
  const candidates: Candidate[] = []

  // Try same time slot, different faculty
  const key = `${assignment.day}-${assignment.slotIndex}`
  const occupied = context.occupancy.get(key) || new Set()

  // Get subject-qualified faculty suggestions
  const subjectFaculty = findSubjectFaculty(context.data, assignment.courseCode, assignment.facultyId)

  console.log("[v0] Subject faculty suggestions:", subjectFaculty.length)

  // Prioritize faculty who can teach this subject
  subjectFaculty.forEach((suggestion) => {
    if (occupied.has(`faculty-${suggestion.facultyId}`)) return // Faculty is occupied

    // Lower cost for better qualified faculty
    const cost = 100 - suggestion.score

    candidates.push({
      assignment,
      newDay: assignment.day,
      newSlot: assignment.slotIndex,
      newRoomId: assignment.roomId,
      newFacultyId: suggestion.facultyId,
      cost,
      reason: `Subject-qualified faculty (${suggestion.facultyName})`,
    })
  })

  // If no subject-qualified faculty available, try any available faculty
  if (candidates.length === 0) {
    context.data.faculty.forEach((faculty) => {
      if (faculty.id === assignment.facultyId) return // Skip current faculty
      if (occupied.has(`faculty-${faculty.id}`)) return // Faculty is occupied

      const course = context.data.courses.find((c) => c.code === assignment.courseCode)
      const cost = course && faculty.department === course.department ? 200 : 300

      candidates.push({
        assignment,
        newDay: assignment.day,
        newSlot: assignment.slotIndex,
        newRoomId: assignment.roomId,
        newFacultyId: faculty.id,
        cost,
        reason: `General faculty substitution (${faculty.name})`,
      })
    })
  }

  console.log("[v0] Faculty candidates found:", candidates.length)

  return candidates.sort((a, b) => a.cost - b.cost)[0] || null
}

function findBestTimeCandidate(assignment: Assignment, context: RepairContext): Candidate | null {
  const candidates: Candidate[] = []
  const days: Day[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

  // Try nearby time slots
  for (let dayOffset = 0; dayOffset < days.length; dayOffset++) {
    const dayIndex = days.indexOf(assignment.day)
    const newDayIndex = (dayIndex + dayOffset) % days.length
    const newDay = days[newDayIndex]

    for (let slotOffset = -2; slotOffset <= 2; slotOffset++) {
      if (slotOffset === 0 && dayOffset === 0) continue // Skip current slot

      const newSlot = assignment.slotIndex + slotOffset
      if (newSlot < 1 || newSlot > 8) continue // Invalid slot

      const key = `${newDay}-${newSlot}`
      const occupied = context.occupancy.get(key) || new Set()

      if (
        occupied.has(`faculty-${assignment.facultyId}`) ||
        occupied.has(`batch-${assignment.batchId}`) ||
        occupied.has(`room-${assignment.roomId}`)
      ) {
        continue // Conflict
      }

      const cost = 50 + Math.abs(slotOffset) * 5 + dayOffset * 10

      candidates.push({
        assignment,
        newDay,
        newSlot,
        newRoomId: assignment.roomId,
        newFacultyId: assignment.facultyId,
        cost,
        reason: "Time change",
      })
    }
  }

  return candidates.sort((a, b) => a.cost - b.cost)[0] || null
}

function generateAllCandidates(assignment: Assignment, context: RepairContext): Candidate[] {
  const candidates: Candidate[] = []

  // Add room candidates
  const roomCandidate = findBestRoomCandidate(assignment, context)
  if (roomCandidate) candidates.push(roomCandidate)

  // Add faculty candidates
  const facultyCandidate = findBestFacultyCandidate(assignment, context)
  if (facultyCandidate) candidates.push(facultyCandidate)

  // Add time candidates
  const timeCandidate = findBestTimeCandidate(assignment, context)
  if (timeCandidate) candidates.push(timeCandidate)

  return candidates
}

function scorePlan(plan: RepairPlan, context: RepairContext): number {
  let score = 0

  // Unscheduled sessions (highest priority)
  const unscheduledSessions = context.assignments.length - plan.moves.length
  score += 1000 * Math.max(0, unscheduledSessions)

  // Moved sessions
  score += 50 * plan.moves.length

  // Faculty changes
  score += 20 * plan.substitutions.length

  // Room changes
  const roomChanges = plan.moves.filter((move) => move.from.roomId !== move.to.roomId).length
  score += 10 * roomChanges

  // Time changes
  const timeChanges = plan.moves.filter(
    (move) => move.from.day !== move.to.day || move.from.slotIndex !== move.to.slotIndex,
  ).length
  score += 5 * timeChanges

  return score
}

export function findSubjectFaculty(
  data: SchedulerData,
  courseCode: string,
  excludeFacultyId?: string,
): Array<{ facultyId: string; facultyName: string; department: string; score: number }> {
  const suggestions: Array<{ facultyId: string; facultyName: string; department: string; score: number }> = []

  // Find the course to get its department
  const course = data.courses.find((c) => c.code === courseCode)
  if (!course) {
    console.log("[v0] Course not found:", courseCode)
    return suggestions
  }

  data.faculty.forEach((faculty) => {
    if (excludeFacultyId && faculty.id === excludeFacultyId) return

    let score = 0

    // Check if faculty teaches this exact course through offerings
    const teachesThisCourse = data.offerings.some(
      (offering) => offering.courseId === courseCode && offering.facultyId === faculty.id,
    )

    if (teachesThisCourse) {
      score += 100 // Highest priority - already teaches this course
    }

    if (faculty.department === course.department) {
      score += 50 // Same department bonus
    }

    // Check if faculty teaches similar courses (same subject area)
    const similarCourses = data.offerings.filter((offering) => {
      const offeringCourse = data.courses.find((c) => c.id === offering.courseId)
      return (
        offering.facultyId === faculty.id &&
        offeringCourse &&
        offeringCourse.code.substring(0, 2) === course.code.substring(0, 2)
      ) // Same subject prefix
    })

    score += similarCourses.length * 10 // Bonus for teaching similar courses

    if (score > 0) {
      suggestions.push({
        facultyId: faculty.id,
        facultyName: faculty.name,
        department: faculty.department,
        score,
      })
    }
  })

  console.log("[v0] Faculty suggestions generated:", suggestions.length)
  return suggestions.sort((a, b) => b.score - a.score)
}
