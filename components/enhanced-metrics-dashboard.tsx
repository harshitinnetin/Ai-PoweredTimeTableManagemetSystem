import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertTriangle, CheckCircle, Clock, Users, Building, Target } from "lucide-react"
import type { EnhancedMetrics, ConflictReport } from "@/lib/enhanced-scheduler"

interface EnhancedMetricsDashboardProps {
  metrics: EnhancedMetrics
  conflictReport?: ConflictReport
  timetableName: string
}

export function EnhancedMetricsDashboard({ metrics, conflictReport, timetableName }: EnhancedMetricsDashboardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 70) return "bg-green-500"
    if (utilization >= 50) return "bg-yellow-500"
    return "bg-red-500"
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header with efficiency score */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{timetableName} Metrics</h3>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            <span className={`text-2xl font-bold ${getScoreColor(metrics.efficiencyScore)}`}>
              {Math.round(metrics.efficiencyScore)}%
            </span>
            <span className="text-sm text-muted-foreground">Efficiency</span>
          </div>
        </div>

        {/* Metrics chips */}
        <div className="flex flex-wrap gap-2">
          <Tooltip>
            <TooltipTrigger>
              <Badge variant={metrics.clashCount === 0 ? "default" : "destructive"} className="gap-1">
                {metrics.clashCount === 0 ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                Clashes: {metrics.clashCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Number of scheduling conflicts detected</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="gap-1">
                <Building className="h-3 w-3" />
                Room Fill: {Math.round(metrics.averageRoomFill)}%
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Average percentage of room capacity utilized</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                Load Balance: {Math.round(metrics.facultyLoadBalance * 10) / 10}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Faculty workload distribution (lower is better)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                Gaps: {metrics.batchGapCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Number of gaps in student schedules</p>
            </TooltipContent>
          </Tooltip>

          {metrics.unscheduledSessions > 0 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Unscheduled: {metrics.unscheduledSessions}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Sessions that could not be scheduled</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Detailed metrics cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Room Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{Math.round(metrics.roomUtilization)}%</span>
                  <Building className="h-4 w-4 text-muted-foreground" />
                </div>
                <Progress value={metrics.roomUtilization} className="h-2" />
                <p className="text-xs text-muted-foreground">Percentage of available room-time slots used</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Faculty Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{Math.round(metrics.facultyUtilization)}%</span>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <Progress value={metrics.facultyUtilization} className="h-2" />
                <p className="text-xs text-muted-foreground">Percentage of faculty time allocated</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Average Room Fill</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{Math.round(metrics.averageRoomFill)}%</span>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </div>
                <Progress value={metrics.averageRoomFill} className="h-2" />
                <p className="text-xs text-muted-foreground">Average room capacity utilization</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conflict report */}
        {conflictReport && (conflictReport.conflicts.length > 0 || conflictReport.unscheduled.length > 0) && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Issues Report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {conflictReport.conflicts.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Conflicts ({conflictReport.conflicts.length})</h4>
                  <div className="space-y-2">
                    {conflictReport.conflicts.slice(0, 5).map((conflict, index) => (
                      <div key={index} className="text-sm p-2 bg-red-50 rounded">
                        <span className="font-medium capitalize">{conflict.type}</span> conflict:
                        {conflict.resourceId} at {conflict.timeSlotId}
                        <span className="text-muted-foreground ml-2">
                          ({conflict.conflictingEntries.length} sessions)
                        </span>
                      </div>
                    ))}
                    {conflictReport.conflicts.length > 5 && (
                      <p className="text-sm text-muted-foreground">
                        +{conflictReport.conflicts.length - 5} more conflicts...
                      </p>
                    )}
                  </div>
                </div>
              )}

              {conflictReport.unscheduled.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Unscheduled Sessions ({conflictReport.unscheduled.length})</h4>
                  <div className="space-y-2">
                    {conflictReport.unscheduled.slice(0, 3).map((session, index) => (
                      <div key={index} className="text-sm p-2 bg-yellow-50 rounded">
                        <span className="font-medium">{session.course.name}</span> - {session.faculty.name}
                        <div className="text-muted-foreground">
                          {session.sessionsScheduled}/{session.sessionsNeeded} sessions scheduled
                        </div>
                        <div className="text-xs text-muted-foreground">{session.reason}</div>
                      </div>
                    ))}
                    {conflictReport.unscheduled.length > 3 && (
                      <p className="text-sm text-muted-foreground">
                        +{conflictReport.unscheduled.length - 3} more unscheduled...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
