import { baseApi } from './baseApi';

export interface SchoolRevenueSummary {
  totalRevenue: number;
  totalInvoiced: number;
  pendingReceivables: number;
  collectionRate: number;
  monthlyDistribution: Array<{ month: string; amount: number }>;
  recentPayments: Array<{
    id: number;
    receiptNo: string;
    studentName: string;
    admissionNo: string;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: string;
    category: string;
  }>;
  studentsCount: number;
  lastUpdated: string;
}

export const financeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSchoolRevenue: build.query<SchoolRevenueSummary, { academicYear?: string } | void>({
      query: (args) => {
        const params = new URLSearchParams();
        if (args && typeof args === 'object' && args.academicYear) {
          params.append('academic_year', args.academicYear);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return `/fee-structures/school-revenue/${query}`;
      },
      providesTags: ['Fee', 'Student'],
    }),
  }),
});

export const { useGetSchoolRevenueQuery } = financeApi;
