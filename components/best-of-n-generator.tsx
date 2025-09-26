"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Zap, Target, Clock } from "lucide-react"
import type { Timetable } from "@/lib/types"

interface BestOfNGeneratorProps {
  onGenerate: (attempts: number, strategy: string) => Promise<Timetable[]>
  isGenerating: boolean
}

export function BestOfNGenerator({ onGenerate, isGenerating }: BestOfNGeneratorProps) {
  const [attempts, setAttempts] = useState("5")
  const [strategy, setStrategy] = useState("student-friendly")

  const handleGenerate = () => {
    onGenerate(Number.parseInt(attempts), strategy)
  }

  const strategyDescriptions = {
    "student-friendly": "Prioritizes morning slots and minimizes gaps in student schedules",
    "faculty-friendly": "Respects faculty preferences and minimizes schedule fragmentation",
    "infra-optimized": "Maximizes room utilization and infrastructure efficiency",
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Enhanced Schedule Generation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Generation Strategy</label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student-friendly">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Student-Friendly
                  </div>
                </SelectItem>
                <SelectItem value="faculty-friendly">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Faculty-Friendly
                  </div>
                </SelectItem>
                <SelectItem value="infra-optimized">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Infrastructure-Optimized
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {strategyDescriptions[strategy as keyof typeof strategyDescriptions]}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Multi-Start Attempts</label>
            <Select value={attempts} onValueChange={setAttempts}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 attempts (Fast)</SelectItem>
                <SelectItem value="5">5 attempts (Balanced)</SelectItem>
                <SelectItem value="10">10 attempts (Thorough)</SelectItem>
                <SelectItem value="20">20 attempts (Maximum)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">More attempts = better results but slower generation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline">Multi-start optimization</Badge>
          <Badge variant="outline">Difficulty-based ordering</Badge>
          <Badge variant="outline">Best-fit room selection</Badge>
        </div>

        <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
          {isGenerating ? "Generating..." : `Generate Best of ${attempts} Schedules`}
        </Button>
      </CardContent>
    </Card>
  )
}
