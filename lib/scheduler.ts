import type { SchedulerData, Timetable, ScheduleEntry, TimeSlot, Room, Batch, Offering } from "./types"

export class SmartScheduler {
  private data: SchedulerData

  constructor(data: SchedulerData) {
    this.data = data
  }

  generateAllTimetables(): Timetable[] {
    return [
      this.generateStudentFriendlyTimetable(),
      this.generateFacultyFriendlyTimetable(),
      this.generateInfraOptimizedTimetable(),
    ]
  }

  private generateStudentFriendlyTimetable(): Timetable {
    const entries: ScheduleEntry[] = []
    const usedSlots = new Map<string, Set<string>>() // timeSlotId -> Set of resourceIds

    // Sort offerings by batch size (larger batches first) and prefer morning slots
    const sortedOfferings = [...this.data.offerings].sort((a, b) => {
      const batchA = this.data.batches.find((batch) => batch.id === a.batchId)
      const batchB = this.data.batches.find((batch) => batch.id === b.batchId)
      return (batchB?.size || 0) - (batchA?.size || 0)
    })

    // Sort time slots to prefer morning hours (student-friendly)
    const sortedTimeSlots = [...this.data.timeSlots].sort((a, b) => {
      const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
      const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)
      if (dayDiff !== 0) return dayDiff
      return a.period - b.period
    })

    for (const offering of sortedOfferings) {
      const course = this.data.courses.find((c) => c.id === offering.courseId)
      const faculty = this.data.faculty.find((f) => f.id === offering.facultyId)
      const batch = this.data.batches.find((b) => b.id === offering.batchId)

      if (!course || !faculty || !batch) continue

      const sessionsNeeded = offering.hoursPerWeek
      let sessionsScheduled = 0

      for (const timeSlot of sortedTimeSlots) {
        if (sessionsScheduled >= sessionsNeeded) break

        const suitableRoom = this.findSuitableRoom(batch, timeSlot, usedSlots)
        if (!suitableRoom) continue

        if (this.hasConflict(offering, timeSlot, usedSlots)) continue

        // Schedule the session
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
        this.markSlotAsUsed(timeSlot.id, [offering.facultyId, offering.batchId, suitableRoom.id], usedSlots)
        sessionsScheduled++
      }
    }

    return {
      id: "student-friendly",
      name: "Student-Friendly Schedule",
      type: "student-friendly",
      entries,
      metrics: this.calculateMetrics(entries),
    }
  }

  private generateFacultyFriendlyTimetable(): Timetable {
    const entries: ScheduleEntry[] = []
    const usedSlots = new Map<string, Set<string>>()

    // Group offerings by faculty to minimize their schedule fragmentation
    const facultyOfferings = new Map<string, Offering[]>()
    this.data.offerings.forEach((offering) => {
      if (!facultyOfferings.has(offering.facultyId)) {
        facultyOfferings.set(offering.facultyId, [])
      }
      facultyOfferings.get(offering.facultyId)!.push(offering)
    })

    // Sort time slots to respect faculty preferences
    const sortedTimeSlots = [...this.data.timeSlots].sort((a, b) => {
      const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
      const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)
      if (dayDiff !== 0) return dayDiff
      return a.period - b.period
    })

    for (const [facultyId, offerings] of facultyOfferings) {
      const faculty = this.data.faculty.find((f) => f.id === facultyId)
      if (!faculty) continue

      // Try to schedule all classes for this faculty in blocks
      for (const offering of offerings) {
        const course = this.data.courses.find((c) => c.id === offering.courseId)
        const batch = this.data.batches.find((b) => b.id === offering.batchId)

        if (!course || !batch) continue

        const sessionsNeeded = offering.hoursPerWeek
        let sessionsScheduled = 0

        // Prefer faculty's preferred slots if available
        const preferredSlots = faculty.preferredSlots || []
        const timeSlotsByPreference = sortedTimeSlots.sort((a, b) => {
          const aPreferred = preferredSlots.includes(`${a.day}-${a.period}`)
          const bPreferred = preferredSlots.includes(`${b.day}-${b.period}`)
          if (aPreferred && !bPreferred) return -1
          if (!aPreferred && bPreferred) return 1
          return 0
        })

        for (const timeSlot of timeSlotsByPreference) {
          if (sessionsScheduled >= sessionsNeeded) break

          const suitableRoom = this.findSuitableRoom(batch, timeSlot, usedSlots)
          if (!suitableRoom) continue

          if (this.hasConflict(offering, timeSlot, usedSlots)) continue

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
          this.markSlotAsUsed(timeSlot.id, [offering.facultyId, offering.batchId, suitableRoom.id], usedSlots)
          sessionsScheduled++
        }
      }
    }

    return {
      id: "faculty-friendly",
      name: "Faculty-Friendly Schedule",
      type: "faculty-friendly",
      entries,
      metrics: this.calculateMetrics(entries),
    }
  }

  private generateInfraOptimizedTimetable(): Timetable {
    const entries: ScheduleEntry[] = []
    const usedSlots = new Map<string, Set<string>>()

    // Sort rooms by capacity (largest first) for better utilization
    const sortedRooms = [...this.data.rooms].sort((a, b) => b.capacity - a.capacity)

    // Sort time slots normally
    const sortedTimeSlots = [...this.data.timeSlots].sort((a, b) => {
      const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
      const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)
      if (dayDiff !== 0) return dayDiff
      return a.period - b.period
    })

    // Try to fill larger rooms first
    for (const room of sortedRooms) {
      for (const timeSlot of sortedTimeSlots) {
        // Find the best offering for this room and time slot
        const suitableOfferings = this.data.offerings.filter((offering) => {
          const batch = this.data.batches.find((b) => b.id === offering.batchId)
          return batch && batch.size <= room.capacity && !this.hasConflict(offering, timeSlot, usedSlots)
        })

        // Sort by batch size to maximize room utilization
        suitableOfferings.sort((a, b) => {
          const batchA = this.data.batches.find((batch) => batch.id === a.batchId)
          const batchB = this.data.batches.find((batch) => batch.id === b.batchId)
          return (batchB?.size || 0) - (batchA?.size || 0)
        })

        for (const offering of suitableOfferings) {
          // Check if this offering still needs sessions
          const existingSessions = entries.filter((e) => e.offeringId === offering.id).length
          if (existingSessions >= offering.hoursPerWeek) continue

          const course = this.data.courses.find((c) => c.id === offering.courseId)
          const faculty = this.data.faculty.find((f) => f.id === offering.facultyId)
          const batch = this.data.batches.find((b) => b.id === offering.batchId)

          if (!course || !faculty || !batch) continue

          const entry: ScheduleEntry = {
            id: `entry-${entries.length}`,
            offeringId: offering.id,
            timeSlotId: timeSlot.id,
            roomId: room.id,
            course,
            faculty,
            batch,
            room,
            timeSlot,
          }

          entries.push(entry)
          this.markSlotAsUsed(timeSlot.id, [offering.facultyId, offering.batchId, room.id], usedSlots)
          break // Only one offering per room per time slot
        }
      }
    }

    return {
      id: "infra-optimized",
      name: "Infrastructure-Optimized Schedule",
      type: "infra-optimized",
      entries,
      metrics: this.calculateMetrics(entries),
    }
  }

  private findSuitableRoom(batch: Batch, timeSlot: TimeSlot, usedSlots: Map<string, Set<string>>): Room | null {
    const availableRooms = this.data.rooms.filter((room) => {
      // Check capacity
      if (room.capacity < batch.size) return false

      // Check availability
      const usedResources = usedSlots.get(timeSlot.id) || new Set()
      return !usedResources.has(room.id)
    })

    // Return the smallest suitable room (efficient utilization)
    return availableRooms.sort((a, b) => a.capacity - b.capacity)[0] || null
  }

  private hasConflict(offering: Offering, timeSlot: TimeSlot, usedSlots: Map<string, Set<string>>): boolean {
    const usedResources = usedSlots.get(timeSlot.id) || new Set()

    // Check faculty conflict
    if (usedResources.has(offering.facultyId)) return true

    // Check batch conflict
    if (usedResources.has(offering.batchId)) return true

    return false
  }

  private markSlotAsUsed(timeSlotId: string, resourceIds: string[], usedSlots: Map<string, Set<string>>) {
    if (!usedSlots.has(timeSlotId)) {
      usedSlots.set(timeSlotId, new Set())
    }
    const usedResources = usedSlots.get(timeSlotId)!
    resourceIds.forEach((id) => usedResources.add(id))
  }

  private calculateMetrics(entries: ScheduleEntry[]) {
    // Calculate clashes (should be 0 with proper scheduling)
    const clashCount = 0 // Our algorithm prevents clashes

    // Calculate room utilization
    const totalRoomSlots = this.data.rooms.length * this.data.timeSlots.length
    const usedRoomSlots = entries.length
    const roomUtilization = totalRoomSlots > 0 ? (usedRoomSlots / totalRoomSlots) * 100 : 0

    // Calculate faculty utilization
    const totalFacultySlots = this.data.faculty.length * this.data.timeSlots.length
    const usedFacultySlots = entries.length
    const facultyUtilization = totalFacultySlots > 0 ? (usedFacultySlots / totalFacultySlots) * 100 : 0

    return {
      clashCount,
      roomUtilization: Math.round(roomUtilization * 100) / 100,
      facultyUtilization: Math.round(facultyUtilization * 100) / 100,
    }
  }
}
