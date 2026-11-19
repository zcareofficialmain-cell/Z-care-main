import { useEffect, useState } from 'react';
import {
  Bell,
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  Trash2,
  Edit2,
  Syringe,
  FlaskConical,
  Pill,
  CalendarCheck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
} from '@/services/api';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type {
  Reminder,
  ReminderFormData,
  ReminderType,
  ReminderStatus,
} from '@/types';
import { formatDate } from '@/utils';

export default function RemindersPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar State — Defaulting to October 2026 as in customer reference image
  const [currentDate, setCurrentDate] = useState(new Date(2026, 9, 1)); // October 2026
  const [selectedDate, setSelectedDate] = useState('2026-10-24'); // Matching 24 October reference

  // Reminder Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRem, setEditingRem] = useState<Reminder | null>(null);
  const [remForm, setRemForm] = useState<ReminderFormData>({
    title: '',
    type: 'appointment',
    due_date: '2026-10-24',
    due_time: '09:00',
    timezone: 'Asia/Kolkata',
    recurrence_rule: '',
    status: 'upcoming',
    notes: '',
    related_record_id: '',
  });

  // Delete Confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id: string;
    title: string;
  }>({
    open: false,
    id: '',
    title: '',
  });

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getReminders(user.id);
      setReminders(data);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sun
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleSelectDay = (day: number) => {
    const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(formattedDate);
  };

  // Reminders for selected date
  const selectedDayReminders = reminders.filter(r => {
    const dueDay = r.due_at.split('T')[0];
    return dueDay === selectedDate;
  });

  // Check which days have reminders
  const hasRemindersOnDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return reminders.some(r => r.due_at.split('T')[0] === dateStr);
  };

  // Submit Reminder
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !remForm.title.trim()) return;

    try {
      if (editingRem) {
        await updateReminder(user.id, editingRem.id, remForm);
        showToast('success', 'Reminder updated');
      } else {
        await createReminder(user.id, remForm);
        showToast('success', 'Reminder scheduled');
      }
      setModalOpen(false);
      setEditingRem(null);
      loadData();
    } catch (err) {
      showToast('error', 'Failed to save reminder');
    }
  };

  const openModal = (rem?: Reminder) => {
    if (rem) {
      setEditingRem(rem);
      const [d, t] = rem.due_at.split('T');
      setRemForm({
        title: rem.title,
        type: rem.type,
        due_date: d,
        due_time: t?.slice(0, 5) || '09:00',
        timezone: rem.timezone || 'Asia/Kolkata',
        recurrence_rule: rem.recurrence_rule || '',
        status: rem.status,
        notes: rem.notes || '',
        related_record_id: rem.related_record_id || '',
      });
    } else {
      setEditingRem(null);
      setRemForm({
        title: '',
        type: 'appointment',
        due_date: selectedDate,
        due_time: '09:00',
        timezone: 'Asia/Kolkata',
        recurrence_rule: '',
        status: 'upcoming',
        notes: '',
        related_record_id: '',
      });
    }
    setModalOpen(true);
  };

  const toggleStatus = async (rem: Reminder) => {
    if (!user) return;
    const newStatus: ReminderStatus = rem.status === 'completed' ? 'upcoming' : 'completed';
    try {
      await updateReminder(user.id, rem.id, { status: newStatus });
      loadData();
      showToast('info', `Reminder marked as ${newStatus}`);
    } catch (err) {
      showToast('error', 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      await deleteReminder(user.id, deleteConfirm.id);
      showToast('success', 'Reminder removed');
      setDeleteConfirm(prev => ({ ...prev, open: false }));
      loadData();
    } catch (err) {
      showToast('error', 'Failed to delete reminder');
    }
  };

  const getTypeIcon = (type: ReminderType) => {
    switch (type) {
      case 'blood-test':
        return <FlaskConical size={18} />;
      case 'vaccination':
        return <Syringe size={18} />;
      case 'medication':
        return <Pill size={18} />;
      default:
        return <CalendarCheck size={18} />;
    }
  };

  const formatDisplayTime = (dueAt: string) => {
    try {
      const timePart = dueAt.split('T')[1];
      if (!timePart) return '';
      const [h, m] = timePart.split(':');
      const hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const formattedHour = hour % 12 || 12;
      return `${String(formattedHour).padStart(2, '0')}:${m} ${ampm}`;
    } catch {
      return '';
    }
  };

  // Render Day Cells
  const calendarCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(<div key={`empty-${i}`} className="h-10 md:h-12" />);
  }
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isSelected = selectedDate === formattedDate;
    const hasDot = hasRemindersOnDay(day);

    calendarCells.push(
      <button
        key={`day-${day}`}
        type="button"
        onClick={() => handleSelectDay(day)}
        className={`h-10 md:h-12 flex flex-col items-center justify-center rounded-xl relative transition-all text-xs font-semibold ${
          isSelected
            ? 'bg-[var(--color-emerald-primary)] text-white shadow-sm'
            : 'hover:bg-[var(--color-mint-soft)] text-[var(--color-text-primary)]'
        }`}
      >
        <span>{day}</span>
        {hasDot && !isSelected && (
          <span
            className="w-1.5 h-1.5 rounded-full mt-0.5"
            style={{ backgroundColor: 'var(--color-emerald-primary)' }}
          />
        )}
      </button>
    );
  }

  // Format Selected Date for Agenda Header
  const selectedDateObj = new Date(selectedDate);
  const formattedSelectedTitle = !isNaN(selectedDateObj.getTime())
    ? `${selectedDateObj.getDate()} ${monthNames[selectedDateObj.getMonth()]}`
    : selectedDate;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Screen 8 Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Health reminders
          </h1>
          <p className="text-sm md:text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
            See your health milestones and health-checkups by date.
          </p>
        </div>

        <button
          onClick={() => openModal()}
          className="btn btn-primary flex items-center gap-1.5"
        >
          <Plus size={16} />
          + New Reminder
        </button>
      </div>

      {/* Main Grid: Monthly Calendar on Left + Selected Day Agenda on Right matching reference */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ============================================================ */}
        {/* Left: Monthly Calendar Component                             */}
        {/* ============================================================ */}
        <div className="lg:col-span-7 card p-6 md:p-8">
          {/* Calendar Month Navigation Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {monthNames[month]} {year}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="btn-icon btn-ghost p-1.5"
                title="Previous Month"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="btn-icon btn-ghost p-1.5"
                title="Next Month"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Weekday Names */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold mb-2" style={{ color: 'var(--color-text-light)' }}>
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells}
          </div>

          {/* Legend matching reference */}
          <div className="mt-8 pt-4 border-t border-[var(--color-border-light)] flex flex-wrap items-center gap-6 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Appointment / Checkup</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>Medication Schedule</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-emerald-primary)]" />
              <span>Lab Test / Vaccine</span>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Right: Selected Day Agenda matching reference design         */}
        {/* ============================================================ */}
        <div className="lg:col-span-5 card p-6 md:p-8">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-[var(--color-border-light)]">
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {formattedSelectedTitle}
              </h2>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {selectedDayReminders.length} event{selectedDayReminders.length !== 1 ? 's' : ''} scheduled
              </span>
            </div>

            <button
              onClick={() => openModal()}
              className="btn btn-outline btn-sm flex items-center gap-1"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Reminders List for Selected Day */}
          <div className="space-y-3">
            {selectedDayReminders.map(rem => (
              <div
                key={rem.id}
                className={`p-4 rounded-xl border transition-all flex items-start gap-3 ${
                  rem.status === 'completed'
                    ? 'bg-[var(--color-bg-page)] opacity-60 border-[var(--color-border-light)]'
                    : 'bg-white border-[var(--color-border)] shadow-xs hover:border-[var(--color-emerald-primary)]'
                }`}
              >
                {/* Type Icon Box */}
                <div
                  className="p-2.5 rounded-xl shrink-0 mt-0.5"
                  style={{
                    backgroundColor:
                      rem.type === 'blood-test'
                        ? 'var(--color-info-light)'
                        : rem.type === 'vaccination'
                        ? 'var(--color-warning-light)'
                        : 'var(--color-mint-soft)',
                    color:
                      rem.type === 'blood-test'
                        ? 'var(--color-info)'
                        : rem.type === 'vaccination'
                        ? 'var(--color-warning)'
                        : 'var(--color-emerald-primary)',
                  }}
                >
                  {getTypeIcon(rem.type)}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <h3
                      className={`text-sm font-bold truncate ${
                        rem.status === 'completed' ? 'line-through' : ''
                      }`}
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {rem.title}
                    </h3>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleStatus(rem)}
                        className="btn-icon btn-ghost p-1 text-xs"
                        title={rem.status === 'completed' ? 'Mark upcoming' : 'Mark completed'}
                      >
                        {rem.status === 'completed' ? (
                          <CheckCircle2 size={16} className="text-emerald-600" />
                        ) : (
                          <Circle size={16} className="text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => openModal(rem)}
                        className="btn-icon btn-ghost p-1 text-xs"
                        title="Edit reminder"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteConfirm({
                            open: true,
                            id: rem.id,
                            title: rem.title,
                          })
                        }
                        className="btn-icon btn-ghost p-1 text-xs hover:text-red-600"
                        title="Delete reminder"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-1 text-xs font-semibold" style={{ color: 'var(--color-emerald-primary)' }}>
                    <Clock size={12} />
                    <span>{formatDisplayTime(rem.due_at)}</span>
                  </div>

                  {rem.notes && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {rem.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {selectedDayReminders.length === 0 && (
              <div className="text-center py-10 border border-dashed rounded-xl border-[var(--color-border)]">
                <Bell size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  No reminders scheduled for this date.
                </p>
                <button
                  onClick={() => openModal()}
                  className="btn btn-outline btn-sm mt-3"
                >
                  <Plus size={14} /> Schedule for {formattedSelectedTitle}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reminder Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRem ? 'Edit Reminder' : 'Schedule Health Reminder'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="input-group">
            <label className="input-label" htmlFor="rem-title">Reminder Title *</label>
            <input
              id="rem-title"
              type="text"
              required
              className="input-field"
              placeholder="e.g. Blood test, Hep B Vaccine 2, Doctor Follow-up"
              value={remForm.title}
              onChange={e => setRemForm({ ...remForm, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="rem-type">Type</label>
              <select
                id="rem-type"
                className="input-field"
                value={remForm.type}
                onChange={e => setRemForm({ ...remForm, type: e.target.value as ReminderType })}
              >
                <option value="appointment">Doctor Appointment</option>
                <option value="blood-test">Blood Test / Lab</option>
                <option value="vaccination">Vaccination</option>
                <option value="medication">Medication Dose</option>
                <option value="follow-up">Follow-up Checkup</option>
                <option value="other">Other Health Reminder</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="rem-status">Status</label>
              <select
                id="rem-status"
                className="input-field"
                value={remForm.status}
                onChange={e => setRemForm({ ...remForm, status: e.target.value as ReminderStatus })}
              >
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
                <option value="snoozed">Snoozed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="rem-date">Due Date</label>
              <input
                id="rem-date"
                type="date"
                required
                className="input-field"
                value={remForm.due_date}
                onChange={e => setRemForm({ ...remForm, due_date: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="rem-time">Due Time</label>
              <input
                id="rem-time"
                type="time"
                required
                className="input-field"
                value={remForm.due_time}
                onChange={e => setRemForm({ ...remForm, due_time: e.target.value })}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="rem-recur">Recurrence (optional)</label>
            <select
              id="rem-recur"
              className="input-field"
              value={remForm.recurrence_rule}
              onChange={e => setRemForm({ ...remForm, recurrence_rule: e.target.value })}
            >
              <option value="">One-time event</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="rem-notes">Preparation Notes</label>
            <textarea
              id="rem-notes"
              className="input-field"
              rows={2}
              placeholder="e.g. 10 hours fasting required for blood glucose test"
              value={remForm.notes}
              onChange={e => setRemForm({ ...remForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingRem ? 'Save Changes' : 'Schedule Reminder'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete Reminder"
        message={`Are you sure you want to delete the reminder "${deleteConfirm.title}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}

