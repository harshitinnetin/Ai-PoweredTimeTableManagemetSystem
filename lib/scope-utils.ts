import type { SchedulerData, ScopeFilter, ScopeMeta } from "./types"

export function getScopedData(data: SchedulerData, scope: ScopeFilter): SchedulerData {
  // Filter offerings first based on scope
  const scopedOfferings = data.offerings.filter((offering) => {
    const batch = data.batches.find((b) => b.id === offering.batchId)
    const faculty = data.faculty.find((f) => f.id === offering.facultyId)

    if (!batch || !faculty) return false

    const departmentMatch = scope.department === "ALL" || faculty.department === scope.department
    const yearMatch = scope.year === "ALL" || batch.year === scope.year

    return departmentMatch && yearMatch
  })

  // Get referenced IDs from scoped offerings
  const referencedBatchIds = new Set(scopedOfferings.map((o) => o.batchId))
  const referencedFacultyIds = new Set(scopedOfferings.map((o) => o.facultyId))
  const referencedCourseIds = new Set(scopedOfferings.map((o) => o.courseId))

  // Filter entities to only those referenced by scoped offerings
  const scopedBatches = data.batches.filter((batch) => referencedBatchIds.has(batch.id))
  const scopedFaculty = data.faculty.filter((faculty) => referencedFacultyIds.has(faculty.id))
  const scopedCourses = data.courses.filter((course) => referencedCourseIds.has(course.id))

  return {
    ...data,
    batches: scopedBatches,
    faculty: scopedFaculty,
    courses: scopedCourses,
    offerings: scopedOfferings,
  }
}

export function getDistinctDepartments(data: SchedulerData): string[] {
  const departments = new Set(data.faculty.map((f) => f.department))
  return Array.from(departments).sort()
}

export function getDistinctYears(data: SchedulerData): number[] {
  const years = new Set(data.batches.map((b) => b.year))
  return Array.from(years).sort((a, b) => a - b)
}

export function createScopeMeta(scope: ScopeFilter, scopedData: SchedulerData): ScopeMeta {
  const filtersApplied = []
  if (scope.department !== "ALL") filtersApplied.push(`Department: ${scope.department}`)
  if (scope.year !== "ALL") filtersApplied.push(`Year: ${scope.year}`)

  const totalSessions = scopedData.offerings.reduce((sum, offering) => sum + offering.hoursPerWeek, 0)

  return {
    department: scope.department,
    year: scope.year,
    filtersApplied,
    generatedAt: new Date().toISOString(),
    totalCourses: scopedData.courses.length,
    totalFaculty: scopedData.faculty.length,
    totalBatches: scopedData.batches.length,
    totalSessions,
  }
}

export function getScopedSummary(scopedData: SchedulerData) {
  const totalSessions = scopedData.offerings.reduce((sum, offering) => sum + offering.hoursPerWeek, 0)

  return {
    courses: scopedData.courses.length,
    faculty: scopedData.faculty.length,
    batches: scopedData.batches.length,
    sessionsPerWeek: totalSessions,
    avgRoomFill: 0, // Will be calculated after scheduling
  }
}
