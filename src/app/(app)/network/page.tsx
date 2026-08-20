import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TopologyGraph } from "@/components/network/topology-graph";

export default function NetworkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Netzwerk-Topologie</h1>
        <p className="text-sm text-muted-foreground">
          Verbindungen zwischen Servern mit aktivierten Netzwerk-Tools
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Topologie</CardTitle>
          <CardDescription>Live, aktualisiert alle 20 Sekunden</CardDescription>
        </CardHeader>
        <CardContent>
          <TopologyGraph />
        </CardContent>
      </Card>
    </div>
  );
}
