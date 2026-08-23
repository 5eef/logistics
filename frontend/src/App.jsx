import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./contexts/AuthContext";

// Each screen is loaded only when its route is visited. In particular, the
// dashboard screens (and their charting dependency) stay out of the public
// tracking page's initial download.
const Home = lazy(() => import("./pages/Home"));
const Auth = lazy(() => import("./pages/Auth"));
const ExpediteurDashboard = lazy(() => import("./pages/expediteur/Dashboard"));
const LivreurDashboard = lazy(() => import("./pages/livreur/Dashboard"));
const DestinataireDashboard = lazy(() => import("./pages/destinataire/Dashboard"));
const VoyageurDashboard = lazy(() => import("./pages/voyageur/Dashboard"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">404</h1>
        <p className="text-gray-600">Page introuvable</p>
        <a href="/" className="mt-4 inline-block text-blue-600 hover:underline">Retour à l'accueil</a>
      </div>
    </div>
  );
}

function dashboardPath(role) {
  return ({ admin: "/admin", expediteur: "/expediteur", livreur: "/livreur", destinataire: "/destinataire", voyageur: "/voyageur" })[role] || "/";
}

function PrivateRoute({ component: Component, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  if (!user) {
    return <Redirect to="/auth" />;
  }
  if (roles && !roles.includes(user.role)) return <Redirect to={dashboardPath(user.role)} />;
  return <Component />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/auth" component={Auth} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/expediteur" component={() => <PrivateRoute component={ExpediteurDashboard} roles={["expediteur"]} />} />
        <Route path="/livreur" component={() => <PrivateRoute component={LivreurDashboard} roles={["livreur"]} />} />
        <Route path="/destinataire" component={() => <PrivateRoute component={DestinataireDashboard} roles={["destinataire"]} />} />
        <Route path="/voyageur" component={() => <PrivateRoute component={VoyageurDashboard} roles={["voyageur"]} />} />
        <Route path="/admin" component={() => <PrivateRoute component={AdminDashboard} roles={["admin"]} />} />
        <Route path="/profil" component={() => <PrivateRoute component={Profile} />} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Chargement de la page">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <AuthProvider>
        <WouterRouter>
          <Router />
        </WouterRouter>
      </AuthProvider>
      <Toaster />
    </TooltipProvider>
  );
}
