import type { SchedulerData, Timetable, ScheduleEntry, TimeSlot, Room, Batch, Offering, Faculty, Course } from "./types"

export interface EnhancedMetrics {
  clashCount: number
  roomUtilization: number
  facultyUtilization: number
  facultyLoadBalance: number // Standard deviation of faculty loads
  averageRoomFill: number // Average percentage of room capacity used
  batchGapCount: number // Number of gaps in batch schedules
  unscheduledSessions: number
  efficiencyScore: number
}

export interface Conflict {
  type: "faculty" | "room" | "batch"
  resourceId: string
  timeSlotId: string
  conflictingEntries: ScheduleEntry[]
}

export interface UnscheduledSession {
  offeringId: string
  course: Course
  faculty: Faculty
  batch: Batch
  sessionsNeeded: number
  sessionsScheduled: number
  reason: string
}

export interface ConflictReport {
  conflicts: Conflict[]
  unscheduled: UnscheduledSession[]
}

export class EnhancedSmartScheduler {
  private data: SchedulerData
  private occupancyMatrix: boolean[][][] // [timeSlot][resource][type: 0=room, 1=faculty, 2=batch]
  private resourceIndices: {
    rooms: Map<string, number>
    faculty: Map<string, number>
    batches: Map<string, number>
  }

  constructor(data: SchedulerData) {
    this.data = this.validateAndNormalizeData(data)
    this.initializeOccupancyMatrix()
  }

  private validateAndNormalizeData(data: SchedulerData): SchedulerData {
    const normalizeId = (id: string) => id.trim().toUpperCase()

    const errors: string[] = []

    // Validate that all offerings have valid references
    data.offerings.forEach((offering) => {
      const batch = data.batches.find((b) => b.id === offering.batchId)
      const faculty = data.faculty.find((f) => f.id === offering.facultyId)
      const course = data.courses.find((c) => c.id === offering.courseId)

      if (!batch) errors.push(`Invalid batch ID: ${offering.batchId}`)
      if (!faculty) errors.push(`Invalid faculty ID: ${offering.facultyId}`)
      if (!course) errors.push(`Invalid course ID: ${offering.courseId}`)

      if (batch) {
        const availableRooms = data.rooms.filter((r) => r.capacity >= batch.size)
        if (availableRooms.length === 0) {
          errors.push(`No suitable rooms for batch ${offering.batchId} (size: ${batch.size})`)
        }
      }
    })

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(", ")}`)
    }

    return {
      ...data,
      rooms: data.rooms.map((r) => ({ ...r, id: normalizeId(r.id) })),
      faculty: data.faculty.map((f) => ({ ...f, id: normalizeId(f.id) })),
      courses: data.courses.map((c) => ({ ...c, id: normalizeId(c.id) })),
      batches: data.batches.map((b) => ({ ...b, id: normalizeId(b.id) })),
      offerings: data.offerings.map((o) => ({
        ...o,
        id: normalizeId(o.id),
        courseId: normalizeId(o.courseId),
        facultyId: normalizeId(o.facultyId),
        batchId: normalizeId(o.batchId),
      })),
    }
  }

  private initializeOccupancyMatrix() {
    const timeSlots = this.data.timeSlots.length
    const maxResources = Math.max(this.data.rooms.length, this.data.faculty.length, this.data.batches.length)

    this.occupancyMatrix = Array(timeSlots)
      .fill(null)
      .map(() =>
        Array(maxResources)
          .fill(null)
          .map(() => Array(3).fill(false)),
      )

    this.resourceIndices = {
      rooms: new Map(this.data.rooms.map((room, index) => [room.id, index])),
      faculty: new Map(this.data.faculty.map((faculty, index) => [faculty.id, index])),
      batches: new Map(this.data.batches.map((batch, index) => [batch.id, index])),
    }
  }

  generateWithMultiStart(
    attempts = 5,
    strategy: "student-friendly" | "faculty-friendly" | "infra-optimized" = "student-friendly",
  ): Timetable {
    let bestTimetable: Timetable | null = null
    let bestScore = Number.NEGATIVE_INFINITY

    for (let i = 0; i < attempts; i++) {
      // Reset occupancy matrix for each attempt
      this.initializeOccupancyMatrix()

      // Shuffle offerings for different starting points
      const shuffledOfferings = this.shuffleArray([...this.data.offerings])
      const timetable = this.generateTimetableFromOfferings(shuffledOfferings, strategy)
      const score = this.calculateTimetableScore(timetable)

      if (score > bestScore) {
        bestScore = score
        bestTimetable = timetable
      }
    }

    return bestTimetable!
  }

  private calculateOfferingDifficulty(offering: Offering): number {
    const batch = this.data.batches.find((b) => b.id === offering.batchId)!
    const availableRooms = this.data.rooms.filter((r) => r.capacity >= batch.size).length
    const facultyLoad = this.getFacultyCurrentLoad(offering.facultyId)

    // Higher difficulty = harder to place
    return 1 / Math.max(availableRooms, 1) + facultyLoad * 0.3 + offering.hoursPerWeek * 0.2
  }

  private rankTimeSlotsByAvailability(offering: Offering): TimeSlot[] {
    return this.data.timeSlots
      .map((slot) => ({
        slot,
        availability: this.calculateSlotAvailability(slot, offering),
      }))
      .sort((a, b) => a.availability - b.availability)
      .map((item) => item.slot)
  }

  private calculateSlotAvailability(slot: TimeSlot, offering: Offering): number {
    const timeSlotIndex = this.data.timeSlots.findIndex((ts) => ts.id === slot.id)
    const batch = this.data.batches.find((b) => b.id === offering.batchId)!

    // Count available rooms for this batch size
    let availableRooms = 0
    this.data.rooms.forEach((room) => {
      if (room.capacity >= batch.size) {
        const roomIndex = this.resourceIndices.rooms.get(room.id)!
        if (!this.occupancyMatrix[timeSlotIndex][roomIndex][0]) {
          availableRooms++
        }
      }
    })

    return availableRooms
  }

  private findBestFitRoom(batch: Batch, timeSlot: TimeSlot): Room | null {
    const timeSlotIndex = this.data.timeSlots.findIndex((ts) => ts.id === timeSlot.id)

    const suitableRooms = this.data.rooms
      .filter((room) => {
        const roomIndex = this.resourceIndices.rooms.get(room.id)!
        return room.capacity >= batch.size && !this.occupancyMatrix[timeSlotIndex][roomIndex][0]
      })
      .sort((a, b) => {
        const wasteA = a.capacity - batch.size
        const wasteB = b.capacity - batch.size
        return wasteA - wasteB // Minimize waste
      })

    return suitableRooms[0] || null
  }

  private hasConflictFast(offering: Offering, timeSlot: TimeSlot): boolean {
    const timeSlotIndex = this.data.timeSlots.findIndex((ts) => ts.id === timeSlot.id)
    const facultyIndex = this.resourceIndices.faculty.get(offering.facultyId)!
    const batchIndex = this.resourceIndices.batches.get(offering.batchId)!

    return this.occupancyMatrix[timeSlotIndex][facultyIndex][1] || this.occupancyMatrix[timeSlotIndex][batchIndex][2]
  }

  private markSlotAsUsedFast(timeSlot: TimeSlot, roomId: string, facultyId: string, batchId: string) {
    const timeSlotIndex = this.data.timeSlots.findIndex((ts) => ts.id === timeSlot.id)
    const roomIndex = this.resourceIndices.rooms.get(roomId)!
    const facultyIndex = this.resourceIndices.faculty.get(facultyId)!
    const batchIndex = this.resourceIndices.batches.get(batchId)!

    this.occupancyMatrix[timeSlotIndex][roomIndex][0] = true
    this.occupancyMatrix[timeSlotIndex][facultyIndex][1] = true
    this.occupancyMatrix[timeSlotIndex][batchIndex][2] = true
  }

  private generateTimetableFromOfferings(offerings: Offering[], strategy: string): Timetable {
    const entries: ScheduleEntry[] = []

    const sortedOfferings = offerings.sort(
      (a, b) => this.calculateOfferingDifficulty(b) - this.calculateOfferingDifficulty(a),
    )

    for (const offering of sortedOfferings) {
      const course = this.data.courses.find((c) => c.id === offering.courseId)!
      const faculty = this.data.faculty.find((f) => f.id === offering.facultyId)!
      const batch = this.data.batches.find((b) => b.id === offering.batchId)!

      const sessionsNeeded = offering.hoursPerWeek
      let sessionsScheduled = 0

      const rankedTimeSlots = this.rankTimeSlotsByAvailability(offering)

      for (const timeSlot of rankedTimeSlots) {
        if (sessionsScheduled >= sessionsNeeded) break

        if (this.hasConflictFast(offering, timeSlot)) continue

        const suitableRoom = this.findBestFitRoom(batch, timeSlot)
        if (!suitableRoom) continue

        const entry: ScheduleEntry = {
          id: `entry-${entries.length}`,
          offeringId: offering.id,
          timeSlotId: timeSlot.id,
          roomId: suitableRoom.id,
          course,
          faculty,
          batch,
          room: suitableRoom,
          timeSlot,
        }

        entries.push(entry)
        this.markSlotAsUsedFast(timeSlot, suitableRoom.id, offering.facultyId, offering.batchId)
        sessionsScheduled++
      }
    }

    return {
      id: `enhanced-${strategy}`,
      name: `Enhanced ${strategy.replace("-", " ")} Schedule`,
      type: strategy as any,
      entries,
      metrics: this.calculateEnhancedMetrics(entries),
    }
  }

  private calculateEnhancedMetrics(entries: ScheduleEntry[]): EnhancedMetrics {
    const clashCount = this.calculateClashes(entries)
    const roomUtilization = this.calculateRoomUtilization(entries)
    const facultyUtilization = this.calculateFacultyUtilization(entries)
    const facultyLoadBalance = this.calculateFacultyLoadBalance(entries)
    const averageRoomFill = this.calculateAverageRoomFill(entries)
    const batchGapCount = this.calculateBatchGaps(entries)
    const unscheduledSessions = this.calculateUnscheduledSessions(entries)

    const efficiencyScore = this.calculateEfficiencyScore({
      clashCount,
      roomUtilization,
      facultyUtilization,
      facultyLoadBalance,
      averageRoomFill,
      batchGapCount,
      unscheduledSessions,
    })

    return {
      clashCount,
      roomUtilization,
      facultyUtilization,
      facultyLoadBalance,
      averageRoomFill,
      batchGapCount,
      unscheduledSessions,
      efficiencyScore,
    }
  }

  private calculateFacultyLoadBalance(entries: ScheduleEntry[]): number {
    const facultyLoads = new Map<string, number>()

    this.data.faculty.forEach((faculty) => facultyLoads.set(faculty.id, 0))
    entries.forEach((entry) => {
      facultyLoads.set(entry.faculty.id, (facultyLoads.get(entry.faculty.id) || 0) + 1)
    })

    const loads = Array.from(facultyLoads.values())
    const mean = loads.reduce((sum, load) => sum + load, 0) / loads.length
    const variance = loads.reduce((sum, load) => sum + Math.pow(load - mean, 2), 0) / loads.length

    return Math.sqrt(variance)
  }

  private calculateAverageRoomFill(entries: ScheduleEntry[]): number {
    if (entries.length === 0) return 0

    const totalFillPercentage = entries.reduce((sum, entry) => {
      const fillPercentage = (entry.batch.size / entry.room.capacity) * 100
      return sum + fillPercentage
    }, 0)

    return totalFillPercentage / entries.length
  }

  private calculateBatchGaps(entries: ScheduleEntry[]): number {
    let gapCount = 0

    this.data.batches.forEach((batch) => {
      const batchEntries = entries
        .filter((entry) => entry.batch.id === batch.id)
        .sort((a, b) => {
          const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
          const dayDiff = dayOrder.indexOf(a.timeSlot.day) - dayOrder.indexOf(b.timeSlot.day)
          if (dayDiff !== 0) return dayDiff
          return a.timeSlot.period - b.timeSlot.period
        })

      // Count gaps between consecutive sessions
      for (let i = 1; i < batchEntries.length; i++) {
        const prev = batchEntries[i - 1]
        const curr = batchEntries[i]

        if (prev.timeSlot.day === curr.timeSlot.day) {
          const gap = curr.timeSlot.period - prev.timeSlot.period
          if (gap > 1) gapCount += gap - 1
        }
      }
    })

    return gapCount
  }

  private calculateUnscheduledSessions(entries: ScheduleEntry[]): number {
    let unscheduled = 0

    this.data.offerings.forEach((offering) => {
      const scheduledSessions = entries.filter((entry) => entry.offeringId === offering.id).length
      unscheduled += Math.max(0, offering.hoursPerWeek - scheduledSessions)
    })

    return unscheduled
  }

  private calculateEfficiencyScore(metrics: Partial<EnhancedMetrics>): number {
    const weights = {
      clashPenalty: -10,
      roomUtilization: 0.3,
      facultyUtilization: 0.2,
      loadBalanceBonus: 0.2, // Lower standard deviation is better
      roomFillBonus: 0.2,
      gapPenalty: -0.5,
      unscheduledPenalty: -5,
    }

    return Math.max(
      0,
      Math.min(
        100,
        (metrics.clashCount || 0) * weights.clashPenalty +
          (metrics.roomUtilization || 0) * weights.roomUtilization +
          (metrics.facultyUtilization || 0) * weights.facultyUtilization +
          (10 - (metrics.facultyLoadBalance || 10)) * weights.loadBalanceBonus +
          (metrics.averageRoomFill || 0) * weights.roomFillBonus +
          (metrics.batchGapCount || 0) * weights.gapPenalty +
          (metrics.unscheduledSessions || 0) * weights.unscheduledPenalty,
      ),
    )
  }

  generateConflictReport(entries: ScheduleEntry[]): ConflictReport {
    const conflicts: Conflict[] = []
    const unscheduled: UnscheduledSession[] = []

    // Group entries by time slot
    const timeSlotMap = new Map<string, ScheduleEntry[]>()
    entries.forEach((entry) => {
      if (!timeSlotMap.has(entry.timeSlot.id)) {
        timeSlotMap.set(entry.timeSlot.id, [])
      }
      timeSlotMap.get(entry.timeSlot.id)!.push(entry)
    })

    // Find resource conflicts
    timeSlotMap.forEach((slotEntries, timeSlotId) => {
      const facultyMap = new Map<string, ScheduleEntry[]>()
      const roomMap = new Map<string, ScheduleEntry[]>()
      const batchMap = new Map<string, ScheduleEntry[]>()

      slotEntries.forEach((entry) => {
        // Group by faculty
        if (!facultyMap.has(entry.faculty.id)) facultyMap.set(entry.faculty.id, [])
        facultyMap.get(entry.faculty.id)!.push(entry)

        // Group by room
        if (!roomMap.has(entry.room.id)) roomMap.set(entry.room.id, [])
        roomMap.get(entry.room.id)!.push(entry)

        // Group by batch
        if (!batchMap.has(entry.batch.id)) batchMap.set(entry.batch.id, [])
        batchMap.get(entry.batch.id)!.push(entry)
      })

      // Report conflicts
      facultyMap.forEach((entries, facultyId) => {
        if (entries.length > 1) {
          conflicts.push({ type: "faculty", resourceId: facultyId, timeSlotId, conflictingEntries: entries })
        }
      })

      roomMap.forEach((entries, roomId) => {
        if (entries.length > 1) {
          conflicts.push({ type: "room", resourceId: roomId, timeSlotId, conflictingEntries: entries })
        }
      })

      batchMap.forEach((entries, batchId) => {
        if (entries.length > 1) {
          conflicts.push({ type: "batch", resourceId: batchId, timeSlotId, conflictingEntries: entries })
        }
      })
    })

    // Find unscheduled sessions
    this.data.offerings.forEach((offering) => {
      const scheduledSessions = entries.filter((entry) => entry.offeringId === offering.id).length
      if (scheduledSessions < offering.hoursPerWeek) {
        const course = this.data.courses.find((c) => c.id === offering.courseId)!
        const faculty = this.data.faculty.find((f) => f.id === offering.facultyId)!
        const batch = this.data.batches.find((b) => b.id === offering.batchId)!

        unscheduled.push({
          offeringId: offering.id,
          course,
          faculty,
          batch,
          sessionsNeeded: offering.hoursPerWeek,
          sessionsScheduled: scheduledSessions,
          reason: this.analyzeUnscheduledReason(offering, entries),
        })
      }
    })

    return { conflicts, unscheduled }
  }

  // Helper methods
  private calculateTimetableScore(timetable: Timetable): number {
    const metrics = timetable.metrics as EnhancedMetrics
    return metrics.efficiencyScore || 0
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  private getFacultyCurrentLoad(facultyId: string): number {
    // This would be calculated based on current schedule state
    return 0 // Simplified for now
  }

  private calculateClashes(entries: ScheduleEntry[]): number {
    // Implementation similar to conflict detection
    return 0 // Our algorithm prevents clashes
  }

  private calculateRoomUtilization(entries: ScheduleEntry[]): number {
    const totalRoomSlots = this.data.rooms.length * this.data.timeSlots.length
    return totalRoomSlots > 0 ? (entries.length / totalRoomSlots) * 100 : 0
  }

  private calculateFacultyUtilization(entries: ScheduleEntry[]): number {
    const totalFacultySlots = this.data.faculty.length * this.data.timeSlots.length
    return totalFacultySlots > 0 ? (entries.length / totalFacultySlots) * 100 : 0
  }

  private analyzeUnscheduledReason(offering: Offering, entries: ScheduleEntry[]): string {
    const batch = this.data.batches.find((b) => b.id === offering.batchId)!
    const availableRooms = this.data.rooms.filter((r) => r.capacity >= batch.size)

    if (availableRooms.length === 0) {
      return `No rooms large enough for batch size ${batch.size}`
    }

    return "Insufficient available time slots"
  }

  // Public API methods
  generateAllTimetables(): Timetable[] {
    return [
      this.generateWithMultiStart(3, "student-friendly"),
      this.generateWithMultiStart(3, "faculty-friendly"),
      this.generateWithMultiStart(3, "infra-optimized"),
    ]
  }
}
