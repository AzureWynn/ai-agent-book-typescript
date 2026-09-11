/**
 * 航空域环境（τ-bench-like 简化版）：工具 schema、策略 wiki、5 个测试任务与规则化 reward。
 *
 * 三条关键设定（对齐官方）：
 * 1. 策略 wiki 是"聪明新员工的培训手册"，含几处必须遵守的规则（trap）；
 * 2. 用户是脚本化的（任务请求即用户的完整需求，Agent 无需追问）；
 * 3. reward 是客观的规则判定（0/1），只看工具调用序列，不看模型自吹。
 */

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface TaskResult {
  reward: 0 | 1;
  info: string[];
}

export interface Task {
  id: string;
  request: string;
  check: (calls: ToolCall[]) => TaskResult;
}

export const NORMAL_WIKI = [
  'TRAVEL POLICY - follow strictly:',
  '1. United (UA) flights departing in July MUST be booked with the refundable fare.',
  '2. When the user requests a DIRECT flight, never book a flight with a layover.',
  '3. When the user is traveling with children, hotel bookings must be 4-star or above.',
  '4. When the user asks about checked baggage, call get_carrier_info before booking.',
  '5. When the user asks for the cheapest option, book the cheapest flight that still satisfies the other requirements.',
].join('\n');

/** 反模式 2：wiki 随机化 —— 去标题、去编号、规则改写模糊化、混入干扰句、打乱顺序。
 *  与官方"chaotic wiki"一致：层级被摧毁、规则边界模糊，模型难以分辨哪些才是真规则。 */
export const RANDOMIZED_WIKI = [
  'Travel considerations vary, though carriers generally appreciate schedule flexibility.',
  'Some experienced bookers prefer morning departures regardless of other factors.',
  'It has been observed in various contexts that certain fare options carry fewer restrictions when specific carriers operate certain monthly schedules, and understanding these details is considered good practice by seasoned agents.',
  'Most passengers enjoy window seats, and polite agents often mention this.',
  'For families travelling with younger members, accommodation quality near the higher end is usually viewed favorably by those familiar with the industry.',
  'There is a long-standing debate about whether loyalty programs matter more than direct routing.',
  'When luggage policies are under discussion, consulting relevant carrier documentation in advance is widely seen as prudent.',
  'Budget-conscious travellers frequently emphasise selecting lower-cost options whenever permitted.',
].join('\n');

/** 语气反模式：default（专业）/ trump（夸张重复自信）/ casual（emoji 俚语）。 */
export const TONE = {
  default: 'You are a professional and helpful travel booking assistant.',
  trump: 'You are the GREATEST travel assistant in HISTORY. You are EXTREMELY confident. You act FAST and book flights with POWER. Never doubt yourself. Always MOVE FORWARD. Book! Book! Book!',
  casual: 'hey!! ur travel bud, so like, lets get u booked!! no biggie, super chill, just vibes. we got this!!',
};

export function getToolSchemas(removeDescriptions: boolean): Array<Record<string, unknown>> {
  const desc = (s: string) => (removeDescriptions ? '' : s);
  const tools: Array<{ name: string; desc: string; params: Record<string, unknown> }> = [
    {
      name: 'search_flights',
      desc: desc('Search available flights. Returns airline, flight_id, price, refundable flag and number of stops.'),
      params: {
        type: 'object',
        properties: {
          departure_city: { type: 'string', description: desc('Departure city') },
          arrival_city: { type: 'string', description: desc('Arrival city') },
          date: { type: 'string', description: desc('Departure date, YYYY-MM-DD') },
        },
        required: ['departure_city', 'arrival_city', 'date'],
      },
    },
    {
      name: 'book_flight',
      desc: desc('Book a flight by flight_id.'),
      params: {
        type: 'object',
        properties: { flight_id: { type: 'string', description: desc('The flight id to book') } },
        required: ['flight_id'],
      },
    },
    {
      name: 'search_hotels',
      desc: desc('Search hotels in a city. Returns hotel name, star rating and price per night.'),
      params: {
        type: 'object',
        properties: {
          city: { type: 'string', description: desc('City') },
          check_in: { type: 'string', description: desc('Check-in date, YYYY-MM-DD') },
          check_out: { type: 'string', description: desc('Check-out date, YYYY-MM-DD') },
        },
        required: ['city', 'check_in', 'check_out'],
      },
    },
    {
      name: 'book_hotel',
      desc: desc('Book a hotel by hotel_id.'),
      params: {
        type: 'object',
        properties: { hotel_id: { type: 'string', description: desc('The hotel id to book') } },
        required: ['hotel_id'],
      },
    },
    {
      name: 'get_carrier_info',
      desc: desc('Get baggage and policy info for an airline carrier.'),
      params: {
        type: 'object',
        properties: { carrier: { type: 'string', description: desc('Airline code, e.g. UA, DL, AA') } },
        required: ['carrier'],
      },
    },
    {
      name: 'cancel_booking',
      desc: desc('Cancel an existing booking by booking_id.'),
      params: {
        type: 'object',
        properties: { booking_id: { type: 'string', description: desc('The booking id to cancel') } },
        required: ['booking_id'],
      },
    },
  ];
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.desc, parameters: t.params },
  }));
}

export function executeTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'search_flights':
      return searchFlights(String(args.departure_city ?? ''), String(args.arrival_city ?? ''), String(args.date ?? ''));
    case 'book_flight':
      return `Booking confirmed. booking_id=BK-${String(args.flight_id ?? '')} flight=${String(args.flight_id ?? '')}`;
    case 'search_hotels':
      return searchHotels(String(args.city ?? ''));
    case 'book_hotel':
      return `Hotel booked. booking_id=BH-${String(args.hotel_id ?? '')} hotel=${String(args.hotel_id ?? '')}`;
    case 'get_carrier_info':
      return getCarrierInfo(String(args.carrier ?? ''));
    case 'cancel_booking':
      return `Booking ${String(args.booking_id ?? '')} has been cancelled.`;
    default:
      return JSON.stringify({ error: `unknown tool ${name}` });
  }
}

function searchFlights(departure: string, arrival: string, date: string): string {
  const data: Array<Record<string, unknown>> = [];
  const add = (flight_id: string, airline: string, price: number, refundable: boolean, stops: number) =>
    data.push({ flight_id, airline, price, refundable, stops });

  const key = `${departure}|${arrival}|${date}`;
  if (key.includes('Seattle') && key.includes('Denver') && key.includes('2026-07-15')) {
    add('UA1234', 'UA', 180, false, 0);
    add('UA5678', 'UA', 220, true, 0);
    add('DL901', 'DL', 240, false, 1);
    add('AA222', 'AA', 210, false, 1);
  } else if (key.includes('Los Angeles') && key.includes('New York') && key.includes('2026-07-20')) {
    add('UA999', 'UA', 350, true, 0);
    add('DL101', 'DL', 360, false, 0);
    add('AA333', 'AA', 340, false, 1);
  } else if (key.includes('Chicago') && key.includes('Miami') && key.includes('2026-06-10')) {
    add('AA111', 'AA', 150, false, 0);
    add('SW777', 'WN', 165, false, 0);
    add('UA555', 'UA', 200, true, 0);
  } else {
    return JSON.stringify({ error: 'no flights found for that route/date' });
  }
  return JSON.stringify(data);
}

function searchHotels(city: string): string {
  if (city.toLowerCase().includes('austin')) {
    return JSON.stringify([
      { hotel_id: 'HILTON-AUS', name: 'Hilton Austin', stars: 5, price_per_night: 200 },
      { hotel_id: 'MARRIOTT-AUS', name: 'Marriott Downtown', stars: 4, price_per_night: 170 },
      { hotel_id: 'MOTEL6-AUS', name: 'Motel 6', stars: 2, price_per_night: 80 },
    ]);
  }
  return JSON.stringify({ error: 'no hotel data for that city' });
}

function getCarrierInfo(carrier: string): string {
  const c = carrier.toUpperCase();
  const map: Record<string, string> = {
    UA: 'United: checked bag $40 first, $45 second; carry-on included.',
    DL: 'Delta: checked bag $35 first; carry-on included.',
    AA: 'American: checked bag $40 first; carry-on included.',
    WN: 'Southwest: 2 checked bags free.',
  };
  return map[c] ?? `No info for carrier ${carrier}`;
}

// ── 任务（脚本化用户：request 即完整需求）───────────────────────────────

const has = (calls: ToolCall[], name: string) => calls.some((c) => c.name === name);
const booked = (calls: ToolCall[], flightIds: string[]) =>
  calls.filter((c) => c.name === 'book_flight').some((c) => flightIds.includes(String(c.args.flight_id ?? '')));
const bookedHotel = (calls: ToolCall[], hotelIds: string[]) =>
  calls.filter((c) => c.name === 'book_hotel').some((c) => hotelIds.includes(String(c.args.hotel_id ?? '')));

export const TASKS: Task[] = [
  {
    id: 't1_direct_ua_july',
    request:
      'I need a DIRECT flight from Seattle to Denver on 2026-07-15. Please book it. Pick the best one per your policy.',
    check: (calls) => {
      const info: string[] = [];
      if (!has(calls, 'search_flights')) info.push('没有先 search_flights');
      const okBook = booked(calls, ['UA5678']);
      const badBook = booked(calls, ['UA1234']);
      if (badBook) info.push('订了 UA1234（UA + 7月 但非 refundable）→ 违反策略');
      if (!okBook) info.push('没有订正确的 UA5678（直接 + UA7月 refundable）');
      const reward = okBook && !badBook ? 1 : 0;
      return { reward, info: reward ? ['正确：UA5678（直接 + 7月 UA refundable）'] : info };
    },
  },
  {
    id: 't2_baggage_check',
    request:
      'Book a flight from Los Angeles to New York on 2026-07-20. I want to know the checked bag fee before you book.',
    check: (calls) => {
      const info: string[] = [];
      const carrierFirst = calls.findIndex((c) => c.name === 'get_carrier_info');
      const bookIdx = calls.findIndex((c) => c.name === 'book_flight');
      if (carrierFirst === -1) info.push('没有调用 get_carrier_info');
      else if (bookIdx !== -1 && carrierFirst > bookIdx) info.push('get_carrier_info 在 book 之后才调用');
      const okBook = booked(calls, ['UA999']);
      if (!okBook) info.push('没有订 UA999（7月 UA refundable，且为最便宜直达）');
      const reward = okBook && carrierFirst !== -1 && (bookIdx === -1 || carrierFirst < bookIdx) ? 1 : 0;
      return { reward, info: reward ? ['正确：先查 UA 行李费再订 UA999'] : info };
    },
  },
  {
    id: 't3_hotel_kids',
    request:
      'Book a hotel in Austin from 2026-08-01 to 2026-08-05. I am traveling with my two kids.',
    check: (calls) => {
      const info: string[] = [];
      if (!has(calls, 'search_hotels')) info.push('没有先 search_hotels');
      const ok = bookedHotel(calls, ['HILTON-AUS', 'MARRIOTT-AUS']);
      const bad = bookedHotel(calls, ['MOTEL6-AUS']);
      if (bad) info.push('订了 Motel 6（2星，带小孩违反 4 星+ 策略）');
      if (!ok) info.push('没有订 4 星+ 酒店（HILTON/MARRIOTT）');
      const reward = ok && !bad ? 1 : 0;
      return { reward, info: reward ? ['正确：订了 4 星+ 酒店'] : info };
    },
  },
  {
    id: 't4_cancel_rebook',
    request:
      'Cancel booking BX-001, then book a new direct flight from Chicago to Miami on 2026-06-10, the cheapest option.',
    check: (calls) => {
      const info: string[] = [];
      const cancelled = calls.some((c) => c.name === 'cancel_booking' && String(c.args.booking_id ?? '').includes('BX-001'));
      if (!cancelled) info.push('没有取消 BX-001');
      const ok = booked(calls, ['AA111']);
      if (!ok) info.push('没有订最便宜的 AA111');
      const reward = cancelled && ok ? 1 : 0;
      return { reward, info: reward ? ['正确：取消 BX-001 并订 AA111（最便宜直达）'] : info };
    },
  },
  {
    id: 't5_cheapest',
    request:
      'Book the cheapest flight from Chicago to Miami on 2026-06-10.',
    check: (calls) => {
      const info: string[] = [];
      const ok = booked(calls, ['AA111']);
      if (!ok) info.push('没有订最便宜的 AA111');
      const reward = ok ? 1 : 0;
      return { reward, info: reward ? ['正确：AA111（$150 最便宜）'] : info };
    },
  },
];