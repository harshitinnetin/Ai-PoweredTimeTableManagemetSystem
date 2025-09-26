"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  BarChart3,
  Download,
  Users,
  Building,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Eye,
  TrendingUp,
  GraduationCap,
  Clock,
} from "lucide-react"
import type { Timetable, ScheduleEntry, ScopeFilter, SchedulerData } from "@/lib/types"
import { TimetableExporter } from "@/lib/export"
import { MetricsDashboard } from "@/components/metrics-dashboard"
import { createScopeMeta } from "@/lib/scope-utils"
import { ReschedulePanel } from "@/components/reschedule-panel"
import type { Assignment, RepairPlan } from "@/lib/types"

interface TimetableViewerProps {
  timetables: Timetable[]
  scope: ScopeFilter
  originalData: SchedulerData | null
  onStepChange: (step: "upload" | "schedule" | "view") => void
}

export function TimetableViewer({ timetables, scope, originalData, onStepChange }: TimetableViewerProps) {
  const [selectedTimetable, setSelectedTimetable] = useState<Timetable>(timetables[0])
  const [isExporting, setIsExporting] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "metrics">("grid")
  const [groupBy, setGroupBy] = useState<"department" | "year">("department")
  const [showReschedulePanel, setShowReschedulePanel] = useState(false)
  const [currentAssignments, setCurrentAssignments] = useState<Assignment[]>([])
  const [assignmentHistory, setAssignmentHistory] = useState<Assignment[][]>([])
  const [isModified, setIsModified] = useState(false)

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
  const timeSlots = [
    { period: 1, time: "09:00-10:00" },
    { period: 2, time: "10:00-11:00" },
    { period: 3, time: "11:00-12:00" },
    { period: 4, time: "12:00-13:00" },
    { period: 5, time: "14:00-15:00" },
    { period: 6, time: "15:00-16:00" },
    { period: 7, time: "16:00-17:00" },
  ]

  const convertAssignmentsToEntries = (assignments: Assignment[]): ScheduleEntry[] => {
    if (!originalData) return []

    return assignments
      .map((assignment) => {
        const course = originalData.courses.find((c) => c.code === assignment.courseCode)
        const faculty = originalData.faculty.find((f) => f.id === assignment.facultyId)
        const room = originalData.rooms.find((r) => r.id === assignment.roomId)
        const batch = originalData.batches.find((b) => b.id === assignment.batchId)

        if (!course || !faculty || !room || !batch) {
          console.warn("Missing data for assignment:", assignment)
          return null
        }

        return {
          course,
          faculty,
          room,
          batch,
          timeSlot: {
            day: assignment.day,
            period: assignment.slotIndex,
          },
        }
      })
      .filter(Boolean) as ScheduleEntry[]
  }

  const getCurrentEntries = (): ScheduleEntry[] => {
    if (isModified && currentAssignments.length > 0) {
      return convertAssignmentsToEntries(currentAssignments)
    }
    return selectedTimetable.entries
  }

  const getScopedEntries = (timetable?: Timetable): ScheduleEntry[] => {
    const entries = isModified ? getCurrentEntries() : (timetable || selectedTimetable).entries

    return entries.filter((entry) => {
      const departmentMatch = scope.department === "ALL" || entry.faculty.department === scope.department
      const yearMatch = scope.year === "ALL" || entry.batch.year === scope.year
      return departmentMatch && yearMatch
    })
  }

  const getScopedTimetableSummary = () => {
    if (!originalData) return { courses: 0, faculty: 0, batches: 0, sessionsPerWeek: 0, avgRoomFill: 0 }

    const scopedEntries = getScopedEntries(selectedTimetable)
    const uniqueCourses = new Set(scopedEntries.map((e) => e.course.id)).size
    const uniqueFaculty = new Set(scopedEntries.map((e) => e.faculty.id)).size
    const uniqueBatches = new Set(scopedEntries.map((e) => e.batch.id)).size
    const totalSessions = scopedEntries.length

    const roomFills = scopedEntries.map((entry) => (entry.batch.size / entry.room.capacity) * 100)
    const avgRoomFill = roomFills.length > 0 ? Math.round(roomFills.reduce((a, b) => a + b, 0) / roomFills.length) : 0

    return {
      courses: uniqueCourses,
      faculty: uniqueFaculty,
      batches: uniqueBatches,
      sessionsPerWeek: totalSessions,
      avgRoomFill,
    }
  }

  const getGroupingData = () => {
    if (!originalData) return { departments: [], years: [] }

    const scopedEntries = getScopedEntries(selectedTimetable)

    if (groupBy === "department") {
      const deptCounts = new Map<string, number>()
      scopedEntries.forEach((entry) => {
        const dept = entry.faculty.department
        deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1)
      })
      return {
        departments: Array.from(deptCounts.entries()).map(([dept, count]) => ({ name: dept, count })),
        years: [],
      }
    } else {
      const yearCounts = new Map<number, number>()
      scopedEntries.forEach((entry) => {
        const year = entry.batch.year
        yearCounts.set(year, (yearCounts.get(year) || 0) + 1)
      })
      return {
        departments: [],
        years: Array.from(yearCounts.entries()).map(([year, count]) => ({ year, count })),
      }
    }
  }

  const getEntryForSlot = (day: string, period: number): ScheduleEntry | null => {
    const scopedEntries = getScopedEntries()
    return scopedEntries.find((entry) => entry.timeSlot.day === day && entry.timeSlot.period === period) || null
  }

  const getColorForCourse = (courseCode: string): string => {
    const colors = [
      "bg-blue-100 text-blue-800 border-blue-200",
      "bg-green-100 text-green-800 border-green-200",
      "bg-purple-100 text-purple-800 border-purple-200",
      "bg-orange-100 text-orange-800 border-orange-200",
      "bg-pink-100 text-pink-800 border-pink-200",
      "bg-indigo-100 text-indigo-800 border-indigo-200",
    ]
    const hash = courseCode.split("").reduce((a, b) => a + b.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  const handleExport = async (format: "excel" | "csv" | "all") => {
    setIsExporting(true)
    try {
      const scopeMeta = originalData ? createScopeMeta(scope, originalData) : undefined

      switch (format) {
        case "excel":
          TimetableExporter.exportToExcelScoped(selectedTimetable, scope, scopeMeta)
          break
        case "csv":
          TimetableExporter.exportToCSVScoped(selectedTimetable, scope, scopeMeta)
          break
        case "all":
          TimetableExporter.exportAllTimetablesScoped(timetables, scope, scopeMeta)
          break
      }
    } catch (error) {
      console.error("Export failed:", error)
    } finally {
      setIsExporting(false)
    }
  }

  const convertTimetableToAssignments = (timetable: Timetable): Assignment[] => {
    return timetable.entries.map((entry, index) => ({
      id: `${entry.course.id}-${entry.batch.id}-${entry.timeSlot.day}-${entry.timeSlot.period}`,
      courseCode: entry.course.code,
      courseName: entry.course.name,
      batchId: entry.batch.id,
      facultyId: entry.faculty.id,
      roomId: entry.room.id,
      day: entry.timeSlot.day as "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday",
      slotIndex: entry.timeSlot.period,
      semester: entry.batch.semester || 1,
      year: entry.batch.year,
      department: entry.faculty.department,
    }))
  }

  const handleApplyRepairPlan = (plan: RepairPlan) => {
    setAssignmentHistory([...assignmentHistory, [...currentAssignments]])

    let updatedAssignments = [...currentAssignments]

    console.log(
      "[v0] Applying repair plan with",
      plan.moves.length,
      "moves and",
      plan.substitutions.length,
      "substitutions",
    )

    plan.moves.forEach((move) => {
      const assignmentIndex = updatedAssignments.findIndex(
        (a) =>
          a.courseCode === move.courseCode &&
          a.batchId === move.batchId &&
          a.day === move.from.day &&
          a.slotIndex === move.from.slotIndex,
      )

      if (assignmentIndex !== -1) {
        console.log("Moving assignment:", move)
        updatedAssignments[assignmentIndex] = {
          ...updatedAssignments[assignmentIndex],
          day: move.to.day,
          slotIndex: move.to.slotIndex,
          roomId: move.to.roomId,
          facultyId: move.to.facultyId,
        }
      } else {
        console.warn("Assignment not found for move:", move)
      }
    })

    plan.substitutions.forEach((sub) => {
      console.log("[v0] Applying substitution:", sub)
      updatedAssignments = updatedAssignments.map((assignment) =>
        assignment.facultyId === sub.facultyFrom ? { ...assignment, facultyId: sub.facultyTo } : assignment,
      )
    })

    setCurrentAssignments(updatedAssignments)
    setIsModified(true)
    console.log("[v0] Applied repair plan, updated assignments count:", updatedAssignments.length)
  }

  const handleUndo = () => {
    if (assignmentHistory.length > 0) {
      const previousState = assignmentHistory[assignmentHistory.length - 1]
      setCurrentAssignments(previousState)
      setAssignmentHistory(assignmentHistory.slice(0, -1))

      if (assignmentHistory.length === 1) {
        setIsModified(false)
      }

      console.log("[v0] Undid last change, assignments count:", previousState.length)
    }
  }

  useEffect(() => {
    if (selectedTimetable) {
      const assignments = convertTimetableToAssignments(selectedTimetable)
      setCurrentAssignments(assignments)
      setIsModified(false)
      setAssignmentHistory([])
      console.log("[v0] Loaded timetable with", assignments.length, "assignments")
    }
  }, [selectedTimetable])

  const summary = getScopedTimetableSummary()
  const groupingData = getGroupingData()
  const isScoped = scope.department !== "ALL" || scope.year !== "ALL"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Timetable Viewer
                {isModified && (
                  <Badge variant="destructive" className="text-xs">
                    Modified
                  </Badge>
                )}
                {isScoped && (
                  <Badge variant="secondary" className="text-xs">
                    {scope.department !== "ALL" && `${scope.department}`}
                    {scope.department !== "ALL" && scope.year !== "ALL" && " · "}
                    {scope.year !== "ALL" && `Year ${scope.year}`}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Review and compare generated timetables
                {isModified && " (showing modified schedule)"}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <Eye className="w-4 h-4 mr-2" />
                Grid View
              </Button>
              <Button
                variant={viewMode === "metrics" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("metrics")}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Metrics
              </Button>
              <Button
                variant={showReschedulePanel ? "default" : "outline"}
                size="sm"
                onClick={() => setShowReschedulePanel(!showReschedulePanel)}
              >
                <Users className="w-4 h-4 mr-2" />
                Reschedule
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              <div>
                <div className="text-sm font-semibold text-blue-900">{summary.courses}</div>
                <div className="text-xs text-blue-700">Courses</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Users className="w-4 h-4 text-green-600" />
              <div>
                <div className="text-sm font-semibold text-green-900">{summary.faculty}</div>
                <div className="text-xs text-green-700">Faculty</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <Users className="w-4 h-4 text-purple-600" />
              <div>
                <div className="text-sm font-semibold text-purple-900">{summary.batches}</div>
                <div className="text-xs text-purple-700">Batches</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <Clock className="w-4 h-4 text-orange-600" />
              <div>
                <div className="text-sm font-semibold text-orange-900">{summary.sessionsPerWeek}</div>
                <div className="text-xs text-orange-700">Sessions/week</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <Building className="w-4 h-4 text-indigo-600" />
              <div>
                <div className="text-sm font-semibold text-indigo-900">{summary.avgRoomFill}%</div>
                <div className="text-xs text-indigo-700">Avg Room Fill</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
            <Label htmlFor="group-switch" className="text-sm font-medium">
              Group by:
            </Label>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="group-switch"
                className={`text-sm ${groupBy === "department" ? "font-medium" : "text-muted-foreground"}`}
              >
                Department
              </Label>
              <Switch
                id="group-switch"
                checked={groupBy === "year"}
                onCheckedChange={(checked) => setGroupBy(checked ? "year" : "department")}
              />
              <Label
                htmlFor="group-switch"
                className={`text-sm ${groupBy === "year" ? "font-medium" : "text-muted-foreground"}`}
              >
                Year
              </Label>
            </div>

            <div className="flex gap-2 ml-4">
              {groupBy === "department" &&
                groupingData.departments.map((dept) => (
                  <Badge key={dept.name} variant="outline" className="text-xs">
                    {dept.name}: {dept.count}
                  </Badge>
                ))}
              {groupBy === "year" &&
                groupingData.years.map((year) => (
                  <Badge key={year.year} variant="outline" className="text-xs">
                    Y{year.year}: {year.count}
                  </Badge>
                ))}
            </div>
          </div>

          <Tabs
            value={selectedTimetable.id}
            onValueChange={(value) => {
              const timetable = timetables.find((t) => t.id === value)
              if (timetable) {
                setSelectedTimetable(timetable)
                const assignments = convertTimetableToAssignments(timetable)
                setCurrentAssignments(assignments)
                setIsModified(false)
                setAssignmentHistory([])
              }
            }}
          >
            <TabsList className="grid w-full grid-cols-3">
              {timetables.map((timetable) => (
                <TabsTrigger key={timetable.id} value={timetable.id} className="text-xs">
                  {timetable.name.split("-")[0]}
                </TabsTrigger>
              ))}
            </TabsList>

            {timetables.map((timetable) => (
              <TabsContent key={timetable.id} value={timetable.id} className="space-y-4">
                {viewMode === "metrics" ? (
                  <MetricsDashboard timetables={timetables} selectedTimetable={selectedTimetable} />
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4 text-primary" />
                            <div>
                              <div className="text-sm text-muted-foreground">Room Utilization</div>
                              <div className="text-lg font-semibold">{timetable.metrics.roomUtilization}%</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-primary" />
                            <div>
                              <div className="text-sm text-muted-foreground">Faculty Utilization</div>
                              <div className="text-lg font-semibold">{timetable.metrics.facultyUtilization}%</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-primary" />
                            <div>
                              <div className="text-sm text-muted-foreground">Scoped Sessions</div>
                              <div className="text-lg font-semibold">{getScopedEntries(timetable).length}</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="overflow-x-auto">
                      <div className="min-w-[800px]">
                        <div className="grid grid-cols-6 gap-1 mb-2">
                          <div className="p-2 font-medium text-center bg-muted rounded">Time</div>
                          {days.map((day) => (
                            <div key={day} className="p-2 font-medium text-center bg-muted rounded">
                              {day}
                            </div>
                          ))}
                        </div>

                        {timeSlots.map((slot) => (
                          <div key={slot.period} className="grid grid-cols-6 gap-1 mb-1">
                            <div className="p-2 text-sm text-center bg-muted/50 rounded flex items-center justify-center">
                              <div>
                                <div className="font-medium">{slot.time}</div>
                                <div className="text-xs text-muted-foreground">Period {slot.period}</div>
                              </div>
                            </div>
                            {days.map((day) => {
                              const entry = getEntryForSlot(day, slot.period)
                              return (
                                <div key={`${day}-${slot.period}`} className="min-h-[80px] border rounded">
                                  {entry ? (
                                    <div
                                      className={`p-2 h-full rounded border ${getColorForCourse(entry.course.code)}`}
                                    >
                                      <div className="text-xs font-semibold">{entry.course.code}</div>
                                      <div className="text-xs truncate">{entry.course.name}</div>
                                      <div className="text-xs mt-1 space-y-0.5">
                                        <div className="flex items-center gap-1">
                                          <Users className="w-3 h-3" />
                                          <span className="truncate">{entry.faculty.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Building className="w-3 h-3" />
                                          <span>{entry.room.name}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {entry.batch.name} ({entry.batch.size})
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-2 h-full flex items-center justify-center text-muted-foreground">
                                      <span className="text-xs">Free</span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {showReschedulePanel && originalData && (
        <Card>
          <CardHeader>
            <CardTitle>Dynamic Rescheduling</CardTitle>
            <CardDescription>
              Handle faculty absence, room unavailability, and other schedule disruptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReschedulePanel
              data={originalData}
              currentAssignments={currentAssignments}
              onApplyPlan={handleApplyRepairPlan}
              onUndo={handleUndo}
              canUndo={assignmentHistory.length > 0}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4 justify-center">
        <Button variant="outline" onClick={() => onStepChange("schedule")}>
          Generate New Schedules
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={isExporting}>
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "Exporting..." : "Export Scoped View"}
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleExport("excel")}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export as Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("csv")}>
              <FileText className="w-4 h-4 mr-2" />
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("all")}>
              <Download className="w-4 h-4 mr-2" />
              Export All Timetables
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
