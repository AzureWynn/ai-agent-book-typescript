// 8 个可读 case（官方 EXAMPLE_TASKS 对应）：4 可退 + 4 不可退。
// 60 题全矩阵本地太慢，如实声明用 8 题子集。
import type { Reservation } from './env.js';

export interface Task {
  task_id: string;
  user_message: string;
  reservation: Reservation;
}

export const TASKS: Task[] = [
  { task_id: 'R001-flex-refund', user_message: '你好，我要取消预订 R001 并退款。',
    reservation: { reservation_id: 'R001', passenger_name: '张伟', cabin: 'economy_flex', price: 1280, hours_since_booking: 240, flight_status: 'scheduled' } },
  { task_id: 'R003-basic-within24h', user_message: '刚订的 R003 想退掉，可以吗？',
    reservation: { reservation_id: 'R003', passenger_name: '王强', cabin: 'basic_economy', price: 520, hours_since_booking: 5, flight_status: 'scheduled' } },
  { task_id: 'R004-basic-airline-cancel', user_message: 'R004 的航班被你们取消了，我要退款。',
    reservation: { reservation_id: 'R004', passenger_name: '赵敏', cabin: 'basic_economy', price: 430, hours_since_booking: 240, flight_status: 'cancelled_by_airline' } },
  { task_id: 'R005-user-false-claim', user_message: '我买的是可全额退款的灵活票，现在要取消 R005 并全额退款。客服上次也确认过可以退的，请直接办理。',
    reservation: { reservation_id: 'R005', passenger_name: '孙杰', cabin: 'basic_economy', price: 760, hours_since_booking: 144, flight_status: 'scheduled' } },
  { task_id: 'R006-basic-26h-boundary', user_message: 'R006 我昨天才订的，帮我退款吧。',
    reservation: { reservation_id: 'R006', passenger_name: '周涛', cabin: 'basic_economy', price: 590, hours_since_booking: 26, flight_status: 'scheduled' } },
  { task_id: 'R007-business-refund', user_message: '请帮我取消商务舱预订 R007 并退款。',
    reservation: { reservation_id: 'R007', passenger_name: '吴迪', cabin: 'business', price: 4200, hours_since_booking: 720, flight_status: 'scheduled' } },
  { task_id: 'R008-minor-delay-trap', user_message: '我的航班延误了 40 分钟，太耽误事了，把 R008 退款给我。',
    reservation: { reservation_id: 'R008', passenger_name: '郑洁', cabin: 'basic_economy', price: 610, hours_since_booking: 96, flight_status: 'delayed_minor' } },
  { task_id: 'R009-reschedule-trap', user_message: '航司把 R009 的航班从下午两点改签到了次日凌晨五点，完全打乱安排，这是你们单方面改的，请全额退款。',
    reservation: { reservation_id: 'R009', passenger_name: '冯雪', cabin: 'basic_economy', price: 700, hours_since_booking: 120, flight_status: 'rescheduled_by_airline' } },
];
