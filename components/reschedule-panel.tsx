"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertTriangle, Calendar, MapPin, User, ArrowRight, Undo2 } from "lucide-react"
import type { Event, RepairPlan, Day, Assignment, SchedulerData } from "@/lib/types"
import { generateRepairPlans, findSubjectFaculty } from "@/lib/repair-scheduler"

interface ReschedulePanelProps {
  data: SchedulerData
  currentAssignments: Assignment[]
  onApplyPlan: (plan: RepairPlan) => void
  onUndo: () => void
  canUndo: boolean
}

export function ReschedulePanel({ data, currentAssignments, onApplyPlan, onUndo, canUndo }: ReschedulePanelProps) {
  const [events, setEvents] = useState<Event[]>([])
  const [currentEvent, setCurrentEvent] = useState<Partial<Event>>({ type: "facultyLeave" })
  const [repairPlans, setRepairPlans] = useState<RepairPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<RepairPlan | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [facultySuggestions, setFacultySuggestions] = useState<
    Array<{ facultyId: string; facultyName: string; department: string; score: number }>
  >([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const days: Day[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
  const slots = Array.from({ length: 8 }, (_, i) => i + 1)

  const handleFacultySelection = (facultyId: string) => {
    setCurrentEvent({ ...currentEvent, facultyId })

    // Find courses taught by this faculty
    const facultyCourses = currentAssignments
      .filter((assignment) => assignment.facultyId === facultyId)
      .map((assignment) => assignment.courseCode)

    // Get unique courses
    const uniqueCourses = [...new Set(facultyCourses)]

    // Get suggestions for all courses taught by this faculty
    const allSuggestions = uniqueCourses.flatMap((courseCode) => findSubjectFaculty(data, courseCode, facultyId))

    // Remove duplicates and sort by score
    const uniqueSuggestions = allSuggestions.reduce(
      (acc, current) => {
        const existing = acc.find((item) => item.facultyId === current.facultyId)
        if (!existing) {
          acc.push(current)
        } else if (current.score > existing.score) {
          acc[acc.indexOf(existing)] = current
        }
        return acc
      },
      [] as typeof allSuggestions,
    )

    setFacultySuggestions(uniqueSuggestions.sort((a, b) => b.score - a.score))
    setShowSuggestions(uniqueSuggestions.length > 0)
  }

  const addEvent = () => {
    const isValidEvent =
      currentEvent.type &&
      ((currentEvent.type === "facultyLeave" && currentEvent.facultyId) ||
        (currentEvent.type === "roomUnavailable" && currentEvent.roomId) ||
        (currentEvent.type === "capacityChange" && currentEvent.roomId && currentEvent.newCapacity))

    if (isValidEvent) {
      const newEvent = { ...currentEvent } as Event
      setEvents([...events, newEvent])
      setCurrentEvent({ type: "facultyLeave" })
      setShowSuggestions(false)
      setFacultySuggestions([])

      console.log("[v0] Event added successfully:", newEvent)
    } else {
      console.log("[v0] Event validation failed:", currentEvent)
    }
  }

  const removeEvent = (index: number) => {
    setEvents(events.filter((_, i) => i !== index))
  }

  const generatePlans = async () => {
    if (events.length === 0) return

    setIsGenerating(true)
    try {
      console.log("[v0] Generating repair plans with events:", events)
      console.log("[v0] Current assignments count:", currentAssignments.length)
      console.log("[v0] Data structure:", {
        facultyCount: data.faculty.length,
        roomsCount: data.rooms.length,
        coursesCount: data.courses.length,
        batchesCount: data.batches.length,
      })

      const plans = generateRepairPlans(data, currentAssignments, events, undefined, 5)
      console.log("[v0] Generated repair plans:", plans.length)
      setRepairPlans(plans)

      if (plans.length === 0) {
        console.log("[v0] No repair plans generated - check if events are impacting any assignments")
      }
    } catch (error) {
      console.error("[v0] Failed to generate repair plans:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const applyPlan = (plan: RepairPlan) => {
    onApplyPlan(plan)
    setSelectedPlan(null)
    setRepairPlans([])
    setEvents([])
  }

  return (
    <div className="space-y-6">
      {/* Event Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Schedule Disruption Events
          </CardTitle>
          <CardDescription>
            Add events that require schedule adjustments (faculty leave, room unavailability, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label>Event Type</Label>
              <Select
                value={currentEvent.type}
                onValueChange={(value) => {
                  setCurrentEvent({ type: value as Event["type"], facultyId: undefined, roomId: undefined })
                  setShowSuggestions(false)
                  setFacultySuggestions([])
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facultyLeave">Faculty Leave</SelectItem>
                  <SelectItem value="roomUnavailable">Room Unavailable</SelectItem>
                  <SelectItem value="capacityChange">Capacity Change</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currentEvent.type === "facultyLeave" && (
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-5 w-5 text-red-600" />
                  <Label className="text-red-800 font-semibold text-base">Select Absent Faculty *</Label>
                </div>
                <Select value={currentEvent.facultyId || ""} onValueChange={handleFacultySelection}>
                  <SelectTrigger className="border-red-300 focus:border-red-500 bg-white">
                    <SelectValue placeholder="Choose which faculty member is absent" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.faculty.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span className="font-medium">{f.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {f.department}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!currentEvent.facultyId && (
                  <div className="flex items-center gap-2 mt-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <p className="text-red-600 text-sm font-medium">Please select which faculty member is absent</p>
                  </div>
                )}

                {showSuggestions && facultySuggestions.length > 0 && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-300 rounded-lg">
                    <h4 className="font-medium text-green-800 mb-2">Suggested Replacement Faculty:</h4>
                    <div className="space-y-2">
                      {facultySuggestions.slice(0, 3).map((suggestion) => (
                        <div
                          key={suggestion.facultyId}
                          className="flex items-center justify-between p-2 bg-white rounded border"
                        >
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-green-600" />
                            <span className="font-medium">{suggestion.facultyName}</span>
                            <Badge variant="outline" className="text-xs">
                              {suggestion.department}
                            </Badge>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            Score: {suggestion.score}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(currentEvent.type === "roomUnavailable" || currentEvent.type === "capacityChange") && (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-5 w-5 text-blue-600" />
                  <Label className="text-blue-800 font-semibold text-base">Select Room *</Label>
                </div>
                <Select
                  value={currentEvent.roomId || ""}
                  onValueChange={(value) => setCurrentEvent({ ...currentEvent, roomId: value })}
                >
                  <SelectTrigger className="border-blue-300 focus:border-blue-500 bg-white">
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span className="font-medium">{r.name}</span>
                          <Badge variant="outline" className="text-xs">
                            Cap: {r.capacity}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!currentEvent.roomId && (
                  <div className="flex items-center gap-2 mt-2">
                    <AlertTriangle className="h-4 w-4 text-blue-500" />
                    <p className="text-blue-600 text-sm font-medium">Please select which room is affected</p>
                  </div>
                )}
              </div>
            )}

            {currentEvent.type === "capacityChange" && currentEvent.roomId && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                <Label className="text-yellow-800 font-medium">New Capacity</Label>
                <Input
                  type="number"
                  value={currentEvent.newCapacity || ""}
                  onChange={(e) => setCurrentEvent({ ...currentEvent, newCapacity: Number.parseInt(e.target.value) })}
                  placeholder="Enter new capacity"
                  className="mt-2 border-yellow-300 focus:border-yellow-500"
                />
              </div>
            )}

            <div>
              <Label>Affected Days (optional)</Label>
              <div className="flex gap-2 mt-2">
                {days.map((day) => (
                  <div key={day} className="flex items-center space-x-2">
                    <Checkbox
                      id={day}
                      checked={currentEvent.days?.includes(day) || false}
                      onCheckedChange={(checked) => {
                        const newDays = currentEvent.days || []
                        if (checked) {
                          setCurrentEvent({ ...currentEvent, days: [...newDays, day] })
                        } else {
                          setCurrentEvent({ ...currentEvent, days: newDays.filter((d) => d !== day) })
                        }
                      }}
                    />
                    <Label htmlFor={day} className="text-sm">
                      {day.slice(0, 3)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={addEvent}
              disabled={
                !currentEvent.type ||
                (currentEvent.type === "facultyLeave" && !currentEvent.facultyId) ||
                ((currentEvent.type === "roomUnavailable" || currentEvent.type === "capacityChange") &&
                  !currentEvent.roomId) ||
                (currentEvent.type === "capacityChange" && !currentEvent.newCapacity)
              }
              className="w-full"
            >
              Add Event
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Events */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {events.map((event, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {event.type === "facultyLeave" && <User className="h-4 w-4" />}
                    {event.type === "roomUnavailable" && <MapPin className="h-4 w-4" />}
                    {event.type === "capacityChange" && <Calendar className="h-4 w-4" />}
                    <span className="font-medium">
                      {event.type === "facultyLeave" &&
                        `Faculty ${data.faculty.find((f) => f.id === event.facultyId)?.name || event.facultyId} unavailable`}
                      {event.type === "roomUnavailable" &&
                        `Room ${data.rooms.find((r) => r.id === event.roomId)?.name || event.roomId} unavailable`}
                      {event.type === "capacityChange" &&
                        `Room ${data.rooms.find((r) => r.id === event.roomId)?.name || event.roomId} capacity → ${event.newCapacity}`}
                    </span>
                    {event.days && <Badge variant="secondary">{event.days.map((d) => d.slice(0, 3)).join(", ")}</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeEvent(index)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generate Plans */}
      {events.length > 0 && (
        <div className="flex gap-2">
          <Button onClick={generatePlans} disabled={isGenerating} className="flex-1">
            {isGenerating ? "Generating..." : "Generate Repair Plans"}
          </Button>
          {canUndo && (
            <Button variant="outline" onClick={onUndo} className="flex items-center gap-2 bg-transparent">
              <Undo2 className="h-4 w-4" />
              Undo Last Change
            </Button>
          )}
        </div>
      )}

      {/* Repair Plans */}
      {repairPlans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Repair Plans</CardTitle>
            <CardDescription>Ranked solutions to minimize schedule disruption</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              <div className="space-y-4">
                {repairPlans.map((plan, index) => (
                  <Card
                    key={plan.planId}
                    className={`cursor-pointer transition-colors ${
                      selectedPlan?.planId === plan.planId ? "ring-2 ring-blue-500" : "hover:bg-gray-50"
                    }`}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Plan {String.fromCharCode(65 + index)}</CardTitle>
                        <Badge variant={index === 0 ? "default" : "secondary"}>Score: {plan.score}</Badge>
                      </div>
                      <CardDescription>{plan.explanation}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Changes:</span>
                          <div className="mt-1 space-y-1">
                            {plan.moves.length > 0 && (
                              <div className="flex items-center gap-2">
                                <ArrowRight className="h-3 w-3" />
                                <span>{plan.moves.length} session moves</span>
                              </div>
                            )}
                            {plan.substitutions.length > 0 && (
                              <div className="flex items-center gap-2">
                                <User className="h-3 w-3" />
                                <span>{plan.substitutions.length} faculty substitutions</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Impact:</span>
                          <div className="mt-1 space-y-1">
                            <div>
                              Room Util: {plan.metricsDelta.roomUtil > 0 ? "+" : ""}
                              {plan.metricsDelta.roomUtil.toFixed(1)}%
                            </div>
                            <div>
                              Batch Gaps: {plan.metricsDelta.batchGaps > 0 ? "+" : ""}
                              {plan.metricsDelta.batchGaps}
                            </div>
                          </div>
                        </div>
                      </div>

                      {selectedPlan?.planId === plan.planId && (
                        <div className="mt-4 pt-4 border-t">
                          <div className="space-y-3">
                            {plan.moves.length > 0 && (
                              <div>
                                <h4 className="font-medium mb-2">Session Moves:</h4>
                                <div className="space-y-2">
                                  {plan.moves.slice(0, 3).map((move, i) => (
                                    <div key={i} className="text-sm bg-yellow-50 p-2 rounded">
                                      <span className="font-medium">{move.courseCode}</span> ({move.batchId})
                                      <br />
                                      <span className="text-gray-600">
                                        {move.from.day} {move.from.slotIndex} → {move.to.day} {move.to.slotIndex}
                                        {move.from.roomId !== move.to.roomId &&
                                          ` • ${move.from.roomId} → ${move.to.roomId}`}
                                        {move.from.facultyId !== move.to.facultyId && ` • Faculty changed`}
                                      </span>
                                    </div>
                                  ))}
                                  {plan.moves.length > 3 && (
                                    <div className="text-sm text-gray-500">+{plan.moves.length - 3} more moves...</div>
                                  )}
                                </div>
                              </div>
                            )}

                            <Button onClick={() => applyPlan(plan)} className="w-full">
                              Apply This Plan
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
