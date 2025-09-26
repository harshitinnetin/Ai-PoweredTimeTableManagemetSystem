"use client"

import { Badge } from "@/components/ui/badge"

import { useState } from "react"
import { Upload, Calendar, BarChart3 } from "lucide-react"
import { CSVUpload } from "@/components/csv-upload"
import { ScheduleGenerator } from "@/components/schedule-generator"
import { TimetableViewer } from "@/components/timetable-viewer"
import { ScopeControls } from "@/components/scope-controls"
import type { SchedulerData, Timetable, ScopeFilter } from "@/lib/types"
import { getScopedData } from "@/lib/scope-utils"

export default function SchedulerPage() {
  const [currentStep, setCurrentStep] = useState<"upload" | "schedule" | "view">("upload")
  const [schedulerData, setSchedulerData] = useState<SchedulerData | null>(null)
  const [timetables, setTimetables] = useState<Timetable[]>([])
  const [scope, setScope] = useState<ScopeFilter>({ department: "ALL", year: "ALL" })

  const handleDataParsed = (data: SchedulerData) => {
    setSchedulerData(data)
    setScope({ department: "ALL", year: "ALL" })
  }

  const handleTimetablesGenerated = (generatedTimetables: Timetable[]) => {
    setTimetables(generatedTimetables)
  }

  const getStepCounts = () => {
    if (!schedulerData) return { rooms: 0, faculty: 0, courses: 0, batches: 0 }

    const scopedData = getScopedData(schedulerData, scope)
    return {
      rooms: schedulerData.rooms.length, // Rooms don't get filtered
      faculty: scopedData.faculty.length,
      courses: scopedData.courses.length,
      batches: scopedData.batches.length,
    }
  }


  const handleScopeChange = (newScope: ScopeFilter) => {
    setScope(newScope)
    // If we're in view step and scope changes, we need to regenerate
    if (currentStep === "view") {
      setCurrentStep("schedule")
      setTimetables([])
    }
  }


  const counts = getStepCounts()
  const isScoped = scope.department !== "ALL" || scope.year !== "ALL"

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <h1 className="text-4xl font-bold text-foreground">AI-Powered Intelligent Timetable Management System</h1>
            {isScoped && (
              <Badge variant="outline" className="text-sm">
                Scoped View
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-lg">
            Generate optimized timetables with intelligent constraint handling
          </p>
        </div>

        {schedulerData && currentStep !== "upload" && (
          <div className="flex justify-center mb-6">
            <ScopeControls data={schedulerData} scope={scope} onScopeChange={handleScopeChange} />
          </div>
        )}

        {/* Progress Steps */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
                currentStep === "upload" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Data</span>
            </div>
            <div className="w-8 h-px bg-border" />
            <div
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
                currentStep === "schedule" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Generate Schedule</span>
            </div>
            <div className="w-8 h-px bg-border" />
            <div
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
                currentStep === "view" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>View & Export</span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="max-w-6xl mx-auto">
          {currentStep === "upload" && <CSVUpload onDataParsed={handleDataParsed} onStepChange={setCurrentStep} />}

          {currentStep === "schedule" && schedulerData && (
            <ScheduleGenerator
              data={getScopedData(schedulerData, scope)}
              scope={scope}
              onTimetablesGenerated={handleTimetablesGenerated}
              onStepChange={setCurrentStep}
            />
          )}

          {currentStep === "view" && timetables.length > 0 && (
            <TimetableViewer
              timetables={timetables}
              scope={scope}
              originalData={schedulerData}
              onStepChange={setCurrentStep}
            />
          )}
        </div>

        {/* Quick Stats */}
        {currentStep !== "view" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 max-w-4xl mx-auto">
            <div className="p-4 text-center bg-card border rounded-lg">
              <div className="text-2xl font-bold text-primary">{counts.rooms}</div>
              <div className="text-sm text-muted-foreground">Rooms</div>
            </div>
            <div className="p-4 text-center bg-card border rounded-lg">
              <div className="text-2xl font-bold text-primary">{counts.faculty}</div>
              <div className="text-sm text-muted-foreground">Faculty</div>
            </div>
            <div className="p-4 text-center bg-card border rounded-lg">
              <div className="text-2xl font-bold text-primary">{counts.courses}</div>
              <div className="text-sm text-muted-foreground">Courses</div>
            </div>
            <div className="p-4 text-center bg-card border rounded-lg">
              <div className="text-2xl font-bold text-primary">{counts.batches}</div>
              <div className="text-sm text-muted-foreground">Batches</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
