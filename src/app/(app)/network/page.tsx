import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TopologyGraph } from "@/components/network/topology-graph";
import { getTranslations } from "next-intl/server";

export default async function NetworkPage() {
  const t = await getTranslations("network");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("topology")}</CardTitle>
          <CardDescription>{t("liveUpdateHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TopologyGraph />
        </CardContent>
      </Card>
    </div>
  );
}
