export class AttendanceService {
  computeDelay(scheduleStart: string, checkTime: string): number {
    const [sh, sm] = scheduleStart.split(':').map(Number);
    const [ch, cm] = checkTime.split(':').map(Number);
    const start = sh*60 + sm;
    const check = ch*60 + cm;
    return Math.max(0, check - start);
  }
}
