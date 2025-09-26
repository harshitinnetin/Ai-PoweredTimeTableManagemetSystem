// Core data types for the scheduler
export interface Room {
  id: string
  name: string
  capacity: number
  type: string
}

export interface Faculty {
  id: string
  name: string
  department: string
  preferredSlots?: string[]
}

export interface Course {
  id: string
  name: string
  code: string
  credits: number
  duration: number // in hours
}

export interface Batch {
  id: string
  name: string
  size: number
  program: string
  year: number
  semester: number
}

export interface TimeSlot {
  id: string
  day: string
  startTime: string
  endTime: string
  period: number
}

export interface Offering {
  id: string
  courseId: string
  facultyId: string
  batchId: string
  hoursPerWeek: number
}

export interface ScheduleEntry {
  id: string
  offeringId: string
  timeSlotId: string
  roomId: string
  course: Course
  faculty: Faculty
  batch: Batch
  room: Room
  timeSlot: TimeSlot
}

export interface Timetable {
  id: string
  name: string
  type: "student-friendly" | "faculty-friendly" | "infra-optimized"
  entries: ScheduleEntry[]
  metrics: {
    clashCount: number
    roomUtilization: number
    facultyUtilization: number
  }
}

export interface SchedulerData {
  rooms: Room[]
  faculty: Faculty[]
  courses: Course[]
  batches: Batch[]
  timeSlots: TimeSlot[]
  offerings: Offering[]
}

export interface ScopeFilter {
  department: string | "ALL"
  year: number | "ALL"
}

export interface ScopeMeta {
  department: string | "ALL"
  year: number | "ALL"
  filtersApplied: string[]
  generatedAt: string
  totalCourses: number
  totalFaculty: number
  totalBatches: number
  totalSessions: number
}

export type Day = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday"

export type Event =
  | { type: "facultyLeave"; facultyId: string; days?: Day[]; slots?: number[]; dateRange?: string }
  | { type: "roomUnavailable"; roomId: string; days?: Day[]; slots?: number[]; dateRange?: string }
  | { type: "capacityChange"; roomId: string; newCapacity: number; days?: Day[]; slots?: number[] }

export interface Assignment {
  id: string
  batchId: string
  courseCode: string
  courseName: string
  facultyId: string
  facultyName: string
  roomId: string
  day: Day
  slotIndex: number
  hoursPerWeek: number
  department: string
  year: number
  semester: number
}

export interface RepairPlan {
  planId: string
  score: number
  explanation: string
  moves: Array<{
    batchId: string
    courseCode: string
    from: { day: Day; slotIndex: number; roomId: string; facultyId: string }
    to: { day: Day; slotIndex: number; roomId: string; facultyId: string }
  }>
  substitutions: Array<{ facultyFrom: string; facultyTo: string }>
  sideEffects?: string[]
  metricsDelta: { clashCount: number; roomUtil: number; batchGaps: number; facultyLoadStdev: number }
}

export interface ChangeLogEntry {
  batchId: string
  courseCode: string
  fromDay?: string
  fromSlot?: number
  fromRoom?: string
  fromFaculty?: string
  toDay: string
  toSlot: number
  toRoom: string
  toFaculty: string
  reason: string
  planId: string
  appliedAt: string
}
