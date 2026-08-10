import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/envelope';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatDate } from '@/shared/lib/format';
import { fadeSlideUp } from '@/shared/motion/variants';
import { Badge, Card, DataTable, Input, PageHeader, Pagination, Select, } from '@/shared/ui';
import { patientName } from '../lib/patient-display';
import { usePatients } from '../model/use-patients';
const PAGE_SIZE = 20;
export function PatientsPage() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [admission, setAdmission] = useState('all');
    const debouncedSearch = useDebounce(search);
    const params = useMemo(() => ({
        page,
        limit: PAGE_SIZE,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(admission === 'all' ? {} : { isAdmitted: admission === 'admitted' }),
    }), [page, debouncedSearch, admission]);
    const { data, isLoading, error } = usePatients(params);
    const columns = useMemo(() => [
        {
            id: 'name',
            header: 'Patient',
            cell: (patient) => (_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium", children: patientName(patient) }), _jsxs("p", { className: "truncate text-xs text-muted", children: [patient.age ? `${patient.age} yrs` : '—', " \u00B7 ", patient.gender] })] })),
        },
        {
            id: 'mrn',
            header: 'MRN',
            numeric: true,
            width: 'w-36',
            cell: (patient) => patient.medicalRecordNumber ?? '—',
        },
        {
            id: 'blood',
            header: 'Blood',
            width: 'w-20',
            hideBelowMd: true,
            cell: (patient) => patient.bloodGroup ?? '—',
        },
        {
            id: 'ward',
            header: 'Ward',
            hideBelowMd: true,
            cell: (patient) => patient.ward ?? '—',
        },
        {
            id: 'status',
            header: 'Status',
            width: 'w-32',
            cell: (patient) => patient.isAdmitted ? (_jsx(Badge, { tone: "info", children: "Admitted" })) : (_jsx(Badge, { tone: "neutral", children: "Outpatient" })),
        },
        {
            id: 'admitted',
            header: 'Admitted',
            numeric: true,
            hideBelowMd: true,
            cell: (patient) => formatDate(patient.admittedAt),
        },
    ], []);
    return (_jsxs(motion.div, { variants: fadeSlideUp, initial: "hidden", animate: "visible", children: [_jsx(PageHeader, { title: "Patients", description: "Search the register by name, medical record number or ward.", children: _jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx("div", { className: "min-w-[16rem] flex-1", children: _jsx(Input, { type: "search", value: search, onChange: (event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                }, placeholder: "Search patients\u2026", "aria-label": "Search patients", adornment: _jsx(Search, { className: "h-4 w-4" }) }) }), _jsxs(Select, { value: admission, "aria-label": "Admission status", className: "w-44", onChange: (event) => {
                                setAdmission(event.target.value);
                                setPage(1);
                            }, children: [_jsx("option", { value: "all", children: "All patients" }), _jsx("option", { value: "admitted", children: "Admitted" }), _jsx("option", { value: "outpatient", children: "Outpatient" })] })] }) }), _jsxs(Card, { children: [_jsx(DataTable, { caption: "Patient register", columns: columns, rows: data?.items ?? [], rowKey: (patient) => patient.id, isLoading: isLoading, error: error
                            ? {
                                title: 'Could not load patients',
                                description: error instanceof ApiError ? error.userMessage : undefined,
                            }
                            : null, onRowClick: (patient) => navigate(`/patients/${patient.id}`), skeletonRows: 8, empty: {
                            icon: Users,
                            title: debouncedSearch ? 'No matching patients' : 'No patients yet',
                            description: debouncedSearch
                                ? 'Try a different name or medical record number.'
                                : 'Registered patients will appear here.',
                        } }), data && _jsx(Pagination, { pagination: data.pagination, onPageChange: setPage, unit: "patient" })] })] }));
}
