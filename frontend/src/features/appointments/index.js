/**
 * Public surface of the appointments slice. Other features import from here
 * only — never from `./ui/...` or `./model/...`.
 */
export { appointmentsApi, } from './api/appointments-api';
export { useAppointment, useAppointments, useBookAppointment, useCancelAppointment, useCompleteAppointment, useConfirmAppointment, useDoctorDaySchedule, useMarkNoShow, usePatientAppointments, useRescheduleAppointment, } from './model/use-appointments';
export { AppointmentActions } from './ui/AppointmentActions';
export { BookAppointmentModal } from './ui/BookAppointmentModal';
export { AppointmentsPage } from './ui/AppointmentsPage';
