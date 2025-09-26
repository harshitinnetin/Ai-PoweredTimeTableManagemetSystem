export const SchedulerPromptPack = {
  // Dataset validation prompt
  validateDataset: `
Analyze this academic scheduling dataset and identify potential issues:

Dataset: {dataset}

Check for:
1. Missing or invalid references between entities
2. Capacity constraints (rooms too small for batches)
3. Impossible scheduling requirements (too many hours per week)
4. Data quality issues (duplicate IDs, missing required fields)
5. Logical inconsistencies

Provide a structured report with:
- Critical issues that prevent scheduling
- Warnings about suboptimal data
- Suggestions for data cleanup
- Estimated scheduling difficulty score (1-10)
`,

  // Heuristic tuning prompt
  tuneHeuristics: `
Given these scheduling results and constraints, suggest heuristic improvements:

Current Results:
- Efficiency Score: {efficiencyScore}%
- Unscheduled Sessions: {unscheduledSessions}
- Room Utilization: {roomUtilization}%
- Faculty Load Balance: {facultyLoadBalance}

Constraints:
{constraints}

Suggest specific improvements to:
1. Offering difficulty calculation weights
2. Time slot ranking criteria
3. Room selection preferences
4. Multi-start parameters

Provide concrete parameter adjustments with reasoning.
`,

  // Conflict explanation prompt
  explainConflicts: `
Explain why these scheduling conflicts occurred and suggest solutions:

Conflicts: {conflicts}
Unscheduled: {unscheduled}
Dataset Summary: {datasetSummary}

For each conflict/issue:
1. Root cause analysis
2. Impact on overall schedule
3. Specific resolution strategies
4. Prevention measures for future runs

Focus on actionable recommendations.
`,

  // Synthetic CSV generation prompt
  generateSyntheticCSV: `
Generate a realistic academic scheduling CSV dataset with these parameters:

Requirements:
- {numRooms} rooms (mix of lecture halls, labs, seminar rooms)
- {numFaculty} faculty members across {numDepartments} departments
- {numCourses} courses with varying credit hours
- {numBatches} student batches of different sizes
- {totalOfferings} course offerings

Constraints:
- Room capacities: 20-200 students
- Faculty load: 12-18 hours per week
- Course credits: 1-4 hours per week
- Realistic department/course relationships
- Varied batch sizes: 15-80 students

Output format: CSV with headers: roomId,roomCapacity,roomType,facultyId,facultyName,department,courseCode,courseName,credits,batchId,batchSize,year,semester,hoursPerWeek

Make it challenging but solvable for scheduling algorithms.
`,

  // Performance optimization prompt
  optimizePerformance: `
Analyze this scheduler performance profile and suggest optimizations:

Current Performance:
- Generation Time: {generationTime}ms
- Memory Usage: {memoryUsage}MB
- Dataset Size: {datasetSize} entities
- Algorithm: Greedy with {heuristics}

Bottlenecks Identified:
{bottlenecks}

Suggest specific code optimizations for:
1. Data structure improvements
2. Algorithm efficiency gains
3. Memory usage reduction
4. Parallel processing opportunities

Provide implementation snippets where applicable.
`,
}

// Helper function to format prompts with data
export function formatPrompt(promptTemplate: string, data: Record<string, any>): string {
  return promptTemplate.replace(/\{(\w+)\}/g, (match, key) => {
    return data[key]?.toString() || match
  })
}
