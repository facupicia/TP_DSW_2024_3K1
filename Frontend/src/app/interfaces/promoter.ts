export interface Promoter {
  id: number;
  promoterId: number;
  email: string;
  firstname: string;
  lastname: string;
  imgPerfil?: string;
  phone?: string;
  commissionPercentage: number;
  promoterCode: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  assignedEvents?: PromoterEventAssignment[];
}

export interface PromoterEventAssignment {
  id: number;
  eventId: number;
  eventTitle?: string;
  eventDate?: string;
  customCommissionPercentage?: number;
  isActive: boolean;
}

export interface CreatePromoterRequest {
  email: string;
  firstname: string;
  lastname: string;
  phone?: string;
  password?: string;
  commissionPercentage?: number;
  promoterCode?: string;
  notes?: string;
}

export interface UpdatePromoterRequest {
  commissionPercentage?: number;
  promoterCode?: string;
  isActive?: boolean;
  notes?: string;
}

export interface PromoterStats {
  promoterId: number;
  firstname: string;
  lastname: string;
  email: string;
  promoterCode: string;
  totalTickets: number;
  totalRevenue: number;
  totalCommission: number;
  avgCommissionRate: number;
}

export interface PromoterStatsDetail {
  promoter: {
    id: number;
    promoterId: number;
    firstname: string;
    lastname: string;
    email: string;
    imgPerfil?: string;
    phone?: string;
    promoterCode: string;
    commissionPercentage: number;
  };
  overallStats: {
    totalTickets: number;
    totalRevenue: number;
    totalCommission: number;
    avgCommissionRate: number;
    firstSale?: string;
    lastSale?: string;
  };
  eventStats: EventStat[];
  recentSales: RecentSale[];
}

export interface EventStat {
  eventId: number;
  eventTitle: string;
  eventDate: string;
  ticketsSold: number;
  revenue: number;
  commission: number;
}

export interface RecentSale {
  ticketId: number;
  eventTitle: string;
  ticketTypeName: string;
  buyerName?: string;
  purchasePrice: number;
  commissionAmount: number;
  commissionPercentage: number;
  soldAt: string;
}

export interface PromoterProfile {
  id: number;
  commissionPercentage: number;
  promoterCode: string;
  organizer: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
  };
  assignedEvents: {
    id: number;
    title: string;
    date: string;
    customCommissionPercentage?: number;
  }[];
}

export interface MyPromoterStats {
  overallStats: {
    totalTickets: number;
    totalRevenue: number;
    totalCommission: number;
    avgCommissionRate: number;
    firstSale?: string;
    lastSale?: string;
  };
  eventStats: EventStat[];
  monthlyStats: MonthlyStat[];
  recentSales: RecentSale[];
}

export interface MonthlyStat {
  month: string;
  ticketsSold: number;
  revenue: number;
  commission: number;
}

export interface EventPromoterStats {
  eventId: number;
  eventTitle: string;
  eventDate: string;
  activePromoters: number;
  totalPromoterTickets: number;
  totalPromoterRevenue: number;
  totalCommissionsPaid: number;
}

export interface AssignedEvent {
  id: number;
  title: string;
  description?: string;
  date: string;
  location?: string;
  imgUrl?: string;
  category?: string;
  customCommissionPercentage?: number;
  shareableLink: string;
  isActive: boolean;
}

export interface MyAssignedEvents {
  promoterCode: string;
  commissionPercentage: number;
  organizer: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
  };
  events: AssignedEvent[];
}
