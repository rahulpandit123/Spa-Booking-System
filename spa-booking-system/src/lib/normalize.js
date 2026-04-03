import { parse, isValid } from 'date-fns';

const parseTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  // Accept "HH:mm" / "HH:mm:ss"
  const trimmed = timeStr.trim();
  // Handle AM/PM formats like "04:40:00 AM"
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hh = Number(ampmMatch[1]);
    const mm = Number(ampmMatch[2]);
    const ss = Number(ampmMatch[3] ?? 0);
    const ap = String(ampmMatch[4]).toUpperCase();
    if (ap === 'PM' && hh < 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    const d = new Date();
    d.setHours(hh, mm, ss, 0);
    return d;
  }
  const formats = ['HH:mm', 'HH:mm:ss', 'H:mm', 'H:mm:ss'];
  for (const f of formats) {
    const d = parse(trimmed, f, new Date());
    if (isValid(d)) return d;
  }
  return null;
};

const parseDmy = (dmyStr) => {
  if (!dmyStr || typeof dmyStr !== 'string') return null;
  const d = parse(dmyStr.trim(), 'dd-MM-yyyy', new Date());
  return isValid(d) ? d : null;
};

const pickString = (...vals) => vals.find((v) => typeof v === 'string' && v.trim().length > 0) ?? null;

const normalizeGender = (g) => {
  const s = typeof g === 'string' ? g.toLowerCase() : '';
  if (!s) return null;
  if (s.includes('female') || s === 'f' || s === 'woman' || s === 'women') return 'female';
  if (s.includes('male') || s === 'm' || s === 'man' || s === 'men') return 'male';
  if (s === '0') return 'female';
  if (s === '1') return 'male';
  return null;
};

export const normalizeTherapist = (t) => {
  const id = t?.id ?? t?.therapist_id ?? t?._id ?? null;
  const gender = normalizeGender(t?.gender ?? t?.sex ?? t?.is_male);
  const first = pickString(t?.first_name, t?.firstname, t?.name_first, t?.given_name);
  const last = pickString(t?.last_name, t?.lastname, t?.family_name, t?.surname);
  const fullName = pickString(
    t?.name,
    t?.full_name,
    [first, last].filter(Boolean).join(' ')
  );
  // Observed backend behavior: `name`/`lastname` may be empty strings, but `alias`/`code` exist.
  const displayName = fullName ?? pickString(t?.alias, t?.code) ?? null;

  return {
    id: id != null ? String(id) : null,
    name: displayName ?? 'Unknown',
    gender: gender ?? 'female',
    raw: t,
  };
};

const normalizeStatus = (s) => {
  const v = typeof s === 'string' ? s : '';
  if (!v) return null;
  // Keep only the required three statuses if possible.
  const lower = v.toLowerCase();
  if (lower.includes('cancel') || lower.includes('no-show') || lower.includes('no show')) return 'Cancelled';
  if (lower.includes('check') || lower.includes('progress') || lower.includes('in progress') || lower.includes('inprogress')) return 'Check-in (In Progress)';
  if (lower.includes('confirm') || lower.includes('active') || lower.includes('complete') || lower.includes('completed')) return 'Confirmed';
  return v;
};

const combineDateAndTime = ({ dateBase, timeStr }) => {
  if (!dateBase) return null;
  const time = parseTime(timeStr);
  if (!time) return null;
  const combined = new Date(dateBase);
  combined.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0);
  return combined;
};

const flattenBookingItems = (booking) => {
  const raw =
    booking?.items ??
    booking?.booking_items ??
    booking?.booking_item ??
    booking?.data?.items ??
    [];

  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    // booking_item is typically a dictionary: { [key]: [item, item] }
    const values = Object.values(raw);
    const out = [];
    for (const v of values) {
      if (Array.isArray(v)) out.push(...v);
      else if (v != null) out.push(v);
    }
    return out;
  }
  return [];
};

export const normalizeBooking = ({ booking, therapistsById, viewDate }) => {
  const bookingId = booking?.id ?? booking?.booking_id ?? booking?._id ?? null;
  const status = normalizeStatus(booking?.status ?? booking?.payment_status ?? booking?.booking_status);
  
  const itemArray = flattenBookingItems(booking);
  const primary = itemArray.find((it) => it?.primary === 1 || it?.primary === true || String(it?.primary) === '1') ?? itemArray[0];
  
  // Try to extract customerId from multiple sources
  let customerId = (
    booking?.customer ?? 
    booking?.customer_id ?? 
    booking?.customerid ?? 
    booking?.user_id ??  // Some APIs use user_id
    booking?.created_by  // Fallback to created_by
  ) ?? null;
  
  // If not found at booking level, try to get it from primary item
  if (!customerId && primary) {
    customerId = (
      primary?.customer ?? 
      primary?.customer_id ?? 
      primary?.customerid ??
      primary?.user_id
    ) ?? null;
  }
  customerId = customerId != null ? String(customerId) : null;

  const therapistIdRaw = primary?.therapist_id ?? primary?.therapist ?? booking?.therapist_id ?? booking?.therapist;
  const therapistId = therapistIdRaw != null ? String(therapistIdRaw) : null;

  const dateBase = booking?.service_date ? parseDmy(booking.service_date) : viewDate;
  const start = combineDateAndTime({ dateBase, timeStr: primary?.start_time ?? primary?.startTime });
  const end = combineDateAndTime({ dateBase, timeStr: primary?.end_time ?? primary?.endTime });

  const durationMinutes =
    Number(primary?.duration ?? primary?.duration_minutes ?? primary?.totalDuration) ||
    (start && end ? Math.max(0, Math.round((end - start) / 60000)) : 0);

  const clientName =
    pickString(
      primary?.customer_name,
      primary?.customer,
      booking?.customer_name,
      booking?.client_name,
      booking?.customerName
    ) || 'Client';

  const serviceRequest = pickString(primary?.service_request, booking?.service_request, primary?.request_type, booking?.request_type);

  const therapist = therapistId ? therapistsById.get(therapistId) : null;
  const therapistNameFromBooking = pickString(primary?.therapist, primary?.therapist_name, primary?.therapistName);
  const therapistDisplayName = therapistNameFromBooking ?? therapist?.name ?? 'Unknown';

  return {
    bookingId: bookingId != null ? String(bookingId) : null,
    customerId: customerId != null ? String(customerId) : null,
    therapistId,
    therapistName: therapistDisplayName,
    therapistGender: therapist?.gender ?? null,
    start,
    end,
    durationMinutes,
    status,
    clientName,
    serviceId: primary?.service_id ?? primary?.service ?? null,
    serviceRequest,
    note: pickString(primary?.note, booking?.note, primary?.service_request_note) ?? null,
    roomSegments: Array.isArray(primary?.room_segments)
      ? primary.room_segments
      : primary?.room_segments
        ? ensureArray(primary.room_segments)
        : [],
    raw: booking,
  };
};

// local helper to avoid circular deps
const ensureArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

