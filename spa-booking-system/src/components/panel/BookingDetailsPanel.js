import React, { useMemo, useState } from 'react';

import './BookingDetailsPanel.css';

const therapistGenderColor = (gender) => {
  const g = String(gender ?? '').toLowerCase();
  return g.includes('male') ? '#3B82F6' : '#EC4899';
};

export default function BookingDetailsPanel({
  booking,
  therapists,
  services = [],
  statusOptions = ['Confirmed', 'Check-in (In Progress)', 'Cancelled'],
  open,
  loading,
  error,
  onClose,
  onCancelBooking,
  onDeleteBooking,
  onUpdateStatus,
  onUpdateBooking,
}) {
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [note, setNote] = useState(booking?.note ?? '');
  const [duration, setDuration] = useState(booking?.durationMinutes ?? 60);
  const [therapistId, setTherapistId] = useState(booking?.therapistId ?? '');
  const [serviceId, setServiceId] = useState(booking?.serviceId ?? '');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setEditMode(false);
    setShowDeleteConfirm(false);
    setNote(booking?.note ?? '');
    setDuration(booking?.durationMinutes ?? 60);
    setTherapistId(booking?.therapistId ?? '');
    setServiceId(booking?.serviceId ?? '');
  }, [booking?.bookingId, booking?.durationMinutes, booking?.note, booking?.therapistId, booking?.serviceId]);

  const therapistColor = useMemo(() => therapistGenderColor(booking?.therapistGender), [booking?.therapistGender]);

  if (!open) return null;
  if (!booking) {
    return (
      <aside className="bdp-root">
        <div className="bdp-empty">Select a booking to view details.</div>
        {onClose ? (
          <button className="bdp-close" type="button" onClick={onClose}>
            Close
          </button>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="bdp-root">
      <div className="bdp-header">
        <div>
          <div className="bdp-title">{booking.clientName}</div>
          <div className="bdp-sub">
            <span className="bdp-dot" style={{ background: therapistColor }} />
            <span>{booking.therapistName}</span>
          </div>
        </div>
        <button className="bdp-close" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="bdp-body">
        {error ? <div className="bdp-error">{error}</div> : null}
        {loading ? <div className="bdp-loading">Loading...</div> : null}

        <div className="bdp-card">
          <div className="bdp-row">
            <div className="bdp-label">Time</div>
            <div className="bdp-value">
              {booking.start ? new Date(booking.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'} -{' '}
              {booking.end ? new Date(booking.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </div>
          </div>
          <div className="bdp-row">
            <div className="bdp-label">Duration</div>
            <div className="bdp-value">{booking.durationMinutes ?? duration} min</div>
          </div>
          <div className="bdp-row">
            <div className="bdp-label">Status</div>
            <div className="bdp-value">{booking.status ?? 'Confirmed'}</div>
          </div>
          {booking.serviceRequest ? (
            <div className="bdp-row">
              <div className="bdp-label">Request</div>
              <div className="bdp-value">{booking.serviceRequest}</div>
            </div>
          ) : null}
          {booking.note ? (
            <div className="bdp-row">
              <div className="bdp-label">Notes</div>
              <div className="bdp-value">{booking.note}</div>
            </div>
          ) : null}
        </div>

        <div className="bdp-actions">
          {!editMode ? (
            <>
              <button className="bdp-btn" type="button" onClick={() => setEditMode(true)}>
                Edit booking
              </button>
              <button className="bdp-btn bdp-btn--danger" type="button" onClick={() => onCancelBooking?.(booking.bookingId)}>
                Cancel booking
              </button>
              <button className="bdp-btn bdp-btn--danger" type="button" onClick={() => setShowDeleteConfirm(true)}>
                Delete
              </button>
            </>
          ) : (
            <>
              <div className="bdp-form">
                <label className="bdp-field">
                  <div className="bdp-field__label">Therapist</div>
                  <select className="bdp-input" value={therapistId} onChange={(e) => setTherapistId(e.target.value)}>
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="bdp-field">
                  <div className="bdp-field__label">Service</div>
                  <select className="bdp-input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                    {services.map((s) => (
                      <option key={s.id ?? s.value} value={s.id ?? s.value}>
                        {s.name ?? s.title ?? s.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="bdp-field">
                  <div className="bdp-field__label">Duration (minutes)</div>
                  <input
                    className="bdp-input"
                    type="number"
                    min={15}
                    step={15}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </label>

                <label className="bdp-field">
                  <div className="bdp-field__label">Notes</div>
                  <textarea className="bdp-input" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
                </label>

                <div className="bdp-form__actions">
                  <button
                    className="bdp-btn"
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await onUpdateBooking?.(booking.bookingId, {
                          therapistId,
                          serviceId,
                          durationMinutes: duration,
                          note,
                        });
                        // Close edit mode after successful save
                        setEditMode(false);
                      } catch (e) {
                        console.error('Update booking error:', e);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                  <button className="bdp-btn bdp-btn--ghost" type="button" onClick={() => setEditMode(false)} disabled={saving}>
                    Cancel edit
                  </button>
                </div>
              </div>

              <div className="bdp-status-actions">
                {statusOptions.map((st) => (
                  <button key={st} className="bdp-btn bdp-btn--ghost" type="button" onClick={() => onUpdateStatus?.(booking.bookingId, st)}>
                    Set {st}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="bdp-modal-overlay">
          <div className="bdp-modal">
            <div className="bdp-modal__header">
              <h3 className="bdp-modal__title">Confirm Delete</h3>
            </div>
            <div className="bdp-modal__body">
              <p>Are you sure you want to delete this spa session? This action cannot be undone.</p>
            </div>
            <div className="bdp-modal__actions">
              <button
                className="bdp-btn"
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
              >
                No, Keep It
              </button>
              <button
                className="bdp-btn bdp-btn--danger"
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDeleteBooking?.(booking.bookingId);
                  onClose?.();
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

