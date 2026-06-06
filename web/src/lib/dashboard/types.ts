export interface DashboardSummary {
  orders: {
    aConfirmer: number;
    pretes: number;
    nouvellesToday: number;
  };
  parcels: {
    enTransit: number;
    livreWeek: number;
    problemes: number;
  };
  stock: {
    oos: number;
    low: number;
  };
  customers: {
    total: number;
    nouveauxWeek: number;
  };
  /** OMITTED entirely unless the caller is owner/admin (enforced server-side). */
  finance?: {
    livreAEncaisser: number;
    enCours: number;
    retours: number;
  };
  attention: Array<{
    kind:
      | "orders_a_confirmer"
      | "parcels_probleme"
      | "stock_oos"
      | "cities_unresolved";
    count: number;
    href: string;
  }>;
  activity: Array<{
    id: string;
    actorName: string;
    action: string;
    createdAt: string;
  }>;
  trend: Array<{ date: string; orders: number }>;
}
