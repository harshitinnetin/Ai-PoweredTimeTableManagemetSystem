"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, Loader2, CheckCircle, Users, Building, GraduationCap } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { SchedulerData, Timetable, ScopeFilter } from "@/lib/types"
import { SmartScheduler } from "@/lib/scheduler"
import { getScopedSummary } from "@/lib/scope-utils"

interface ScheduleGeneratorProps {
  data: SchedulerData
  scope: ScopeFilter
  onTimetablesGenerated: (timetables: Timetable[]) => void
  onStepChange: (step: "upload" | "schedule" | "view") => void
}

export function ScheduleGenerator({ data, scope, onTimetablesGenerated, onStepChange }: ScheduleGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationComplete, setGenerationComplete] = useState(false)
  const [generatedTimetables, setGeneratedTimetables] = useState<Timetable[]>([])

  const summary = getScopedSummary(data)
  const isScoped = scope.department !== "ALL" || scope.year !== "ALL"

  const generateTimetables = async () => {
    setIsGenerating(true)

    // Simulate processing time for better UX
    await new Promise((resolve) => setTimeout(resolve, 2000))

    try {
      const scheduler = new SmartScheduler(data)
      const timetables = scheduler.generateAllTimetables()

      setGeneratedTimetables(timetables)
      setGenerationComplete(true)
      onTimetablesGenerated(timetables)
      setIsGenerating(false)
    } catch (error) {
      console.error("Error generating timetables:", error)
      setIsGenerating(false)
    }
  }

  const isEmpty = data.offerings.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Generate Timetables
          {isScoped && (
            <span className="text-sm font-normal text-muted-foreground">
              ({scope.department !== "ALL" && scope.department}
              {scope.department !== "ALL" && scope.year !== "ALL" && " · "}
              {scope.year !== "ALL" && `Year ${scope.year}`})
            </span>
          )}
        </CardTitle>
        <CardDescription>Create optimized schedules with different priorities</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isEmpty ? (
          <Alert>
            <AlertDescription>
              No data available for the selected scope. Please adjust your department or year filters, or upload data
              that includes the selected criteria.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Building className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-semibold">{data.rooms.length}</div>
                  <div className="text-sm text-muted-foreground">Rooms</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-semibold">{summary.faculty}</div>
                  <div className="text-sm text-muted-foreground">Faculty</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <GraduationCap className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-semibold">{summary.courses}</div>
                  <div className="text-sm text-muted-foreground">Courses</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-semibold">{summary.batches}</div>
                  <div className="text-sm text-muted-foreground">Batches</div>
                </div>
              </div>
            </div>

            {summary.sessionsPerWeek > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm font-medium text-blue-900">
                  Total Sessions per Week: {summary.sessionsPerWeek}
                </div>
                <div className="text-xs text-blue-700 mt-1">Based on current scope selection</div>
              </div>
            )}

            {/* Generation Options */}
            <div className="space-y-4">
              <h4 className="font-medium">Scheduling Strategies:</h4>
              <div className="grid gap-3">
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium text-sm">Student-Friendly</h5>
                  <p className="text-sm text-muted-foreground">
                    Prioritizes morning slots and minimizes gaps in student schedules
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium text-sm">Faculty-Friendly</h5>
                  <p className="text-sm text-muted-foreground">
                    Respects faculty preferences and minimizes schedule fragmentation
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium text-sm">Infrastructure-Optimized</h5>
                  <p className="text-sm text-muted-foreground">
                    Maximizes room utilization and optimizes resource allocation
                  </p>
                </div>
              </div>
            </div>

            {/* Generation Button */}
            {!generationComplete && (
              <Button onClick={generateTimetables} disabled={isGenerating} size="lg" className="w-full">
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Timetables...
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    Generate All Timetables
                  </>
                )}
              </Button>
            )}

            {/* Success Message */}
            {generationComplete && (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Successfully generated {generatedTimetables.length} timetable variants! Each variant optimizes for
                    different priorities.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3">
                  {generatedTimetables.map((timetable) => (
                    <div key={timetable.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-medium">{timetable.name}</h5>
                          <p className="text-sm text-muted-foreground">{timetable.entries.length} scheduled sessions</p>
                        </div>
                        <div className="text-right text-sm">
                          <div>Room Util: {timetable.metrics.roomUtilization}%</div>
                          <div>Clashes: {timetable.metrics.clashCount}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Button onClick={() => onStepChange("view")} size="lg" className="w-full">
                  View Timetables
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
