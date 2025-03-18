import { Injectable } from '@nestjs/common';

@Injectable()
export class SharedService {
  constructor() { }

  getUid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  getFutureUtcDate(day: number): Date {
    const currentDate = new Date();
    currentDate.setUTCDate(currentDate.getUTCDate() + day);
    return currentDate;
  }

}
