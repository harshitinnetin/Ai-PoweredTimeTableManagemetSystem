"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import type { ScopeFilter, SchedulerData } from "@/lib/types"
import { getDistinctDepartments, getDistinctYears } from "@/lib/scope-utils"

interface ScopeControlsProps {
  data: SchedulerData | null
  scope: ScopeFilter
  onScopeChange: (scope: ScopeFilter) => void
  className?: string
}

export function ScopeControls({ data, scope, onScopeChange, className = "" }: ScopeControlsProps) {
  if (!data) return null

  const departments = getDistinctDepartments(data)
  const years = getDistinctYears(data)

  const handleDepartmentChange = (department: string) => {
    onScopeChange({ ...scope, department })
  }

  const handleYearChange = (year: string) => {
    onScopeChange({ ...scope, year: year === "ALL" ? "ALL" : Number.parseInt(year) })
  }

  const isScoped = scope.department !== "ALL" || scope.year !== "ALL"

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="flex items-center gap-2">
        <Select value={scope.department} onValueChange={handleDepartmentChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={scope.year.toString()} onValueChange={handleYearChange}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All Years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Years</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                Year {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isScoped && (
        <Badge variant="secondary" className="text-xs">
          {scope.department !== "ALL" && `Dept: ${scope.department}`}
          {scope.department !== "ALL" && scope.year !== "ALL" && " · "}
          {scope.year !== "ALL" && `Year: ${scope.year}`}
        </Badge>
      )}
    </div>
  )
}
