"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { BarChart3, Users, Building, Calendar, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react"
import type { Timetable } from "@/lib/types"

interface MetricsDashboardProps {
  timetables: Timetable[]
  selectedTimetable: Timetable
}

export function MetricsDashboard({ timetables, selectedTimetable }: MetricsDashboardProps) {
  const getUtilizationColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600"
    if (percentage >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getUtilizationBadge = (percentage: number) => {
    if (percentage >= 80)
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          Excellent
        </Badge>
      )
    if (percentage >= 60)
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          Good
        </Badge>
      )
    return (
      <Badge variant="destructive" className="bg-red-100 text-red-800">
        Needs Improvement
      </Badge>
    )
  }

  const calculateEfficiencyScore = (timetable: Timetable) => {
    const roomScore = timetable.metrics.roomUtilization
    const facultyScore = timetable.metrics.facultyUtilization
    const clashPenalty = timetable.metrics.clashCount * 10
    return Math.max(0, Math.round((roomScore + facultyScore) / 2 - clashPenalty))
  }

  const getBestTimetable = () => {
    return timetables.reduce((best, current) => {
      const bestScore = calculateEfficiencyScore(best)
      const currentScore = calculateEfficiencyScore(current)
      return currentScore > bestScore ? current : best
    })
  }

  const bestTimetable = getBestTimetable()
  const efficiencyScore = calculateEfficiencyScore(selectedTimetable)

  return (
    <div className="space-y-6">
      {/* Overall Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Performance Overview
          </CardTitle>
          <CardDescription>Key metrics for {selectedTimetable.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">{efficiencyScore}%</div>
              <div className="text-sm text-muted-foreground">Overall Efficiency Score</div>
            </div>
            <div className="text-right">
              {selectedTimetable.id === bestTimetable.id ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Best Option
                </Badge>
              ) : (
                <Badge variant="outline">Alternative</Badge>
              )}
            </div>
          </div>
          <Progress value={efficiencyScore} className="h-2" />
        </CardContent>
      </Card>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-sm text-muted-foreground">Room Utilization</div>
                  <div
                    className={`text-lg font-semibold ${getUtilizationColor(selectedTimetable.metrics.roomUtilization)}`}
                  >
                    {selectedTimetable.metrics.roomUtilization}%
                  </div>
                </div>
              </div>
              {getUtilizationBadge(selectedTimetable.metrics.roomUtilization)}
            </div>
            <Progress value={selectedTimetable.metrics.roomUtilization} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-sm text-muted-foreground">Faculty Utilization</div>
                  <div
                    className={`text-lg font-semibold ${getUtilizationColor(selectedTimetable.metrics.facultyUtilization)}`}
                  >
                    {selectedTimetable.metrics.facultyUtilization}%
                  </div>
                </div>
              </div>
              {getUtilizationBadge(selectedTimetable.metrics.facultyUtilization)}
            </div>
            <Progress value={selectedTimetable.metrics.facultyUtilization} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">Schedule Conflicts</div>
                <div className="text-lg font-semibold">
                  {selectedTimetable.metrics.clashCount}
                  {selectedTimetable.metrics.clashCount === 0 && (
                    <CheckCircle className="w-4 h-4 inline ml-1 text-green-600" />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">Total Sessions</div>
                <div className="text-lg font-semibold">{selectedTimetable.entries.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resource Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Resource Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {new Set(selectedTimetable.entries.map((e) => e.room.id)).size}
              </div>
              <div className="text-sm text-muted-foreground">Rooms Used</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {new Set(selectedTimetable.entries.map((e) => e.faculty.id)).size}
              </div>
              <div className="text-sm text-muted-foreground">Faculty Assigned</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {new Set(selectedTimetable.entries.map((e) => e.course.id)).size}
              </div>
              <div className="text-sm text-muted-foreground">Courses Scheduled</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {new Set(selectedTimetable.entries.map((e) => e.batch.id)).size}
              </div>
              <div className="text-sm text-muted-foreground">Batches Involved</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison with Other Timetables */}
      {timetables.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Comparison with Other Options</CardTitle>
            <CardDescription>How this timetable compares to other generated options</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {timetables.map((timetable) => (
                <div
                  key={timetable.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    timetable.id === selectedTimetable.id ? "bg-primary/5 border-primary" : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="font-medium">{timetable.name}</div>
                    {timetable.id === bestTimetable.id && (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Best
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Room: </span>
                      <span className="font-medium">{timetable.metrics.roomUtilization}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Faculty: </span>
                      <span className="font-medium">{timetable.metrics.facultyUtilization}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Score: </span>
                      <span className="font-medium">{calculateEfficiencyScore(timetable)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
