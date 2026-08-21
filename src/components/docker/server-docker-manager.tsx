"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DockerRow } from "@/components/docker/docker-row";
import { ImageRow } from "@/components/docker/image-row";
import { PullImageDialog } from "@/components/docker/pull-image-dialog";
import { CreateContainerDialog } from "@/components/docker/create-container-dialog";
import { ArrowLeft, Container, Layers } from "lucide-react";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import type { ContainerSnapshotDTO, ContainerWithServerDTO, DockerImageDTO, ServerDTO } from "@/lib/types";

export function ServerDockerManager({ serverId }: { serverId: string }) {
  const t = useTranslations("docker.serverManager");
  const session = useSession();
  const canControl = session?.role === "EDITOR" || session?.role === "ADMIN";

  const [server, setServer] = useState<ServerDTO | null>(null);
  const [containers, setContainers] = useState<ContainerSnapshotDTO[] | null>(null);
  const [images, setImages] = useState<DockerImageDTO[] | null>(null);

  const load = useCallback(async () => {
    const [serverRes, containersRes, imagesRes] = await Promise.all([
      fetch(`/api/servers/${serverId}`),
      fetch(`/api/servers/${serverId}/containers`),
      fetch(`/api/servers/${serverId}/images`),
    ]);
    if (serverRes.ok) setServer((await serverRes.json()).server);
    if (containersRes.ok) setContainers((await containersRes.json()).containers);
    if (imagesRes.ok) setImages((await imagesRes.json()).images);
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents((event) => {
    if (event.type === "docker" && event.serverId === serverId) {
      setContainers(event.containers as ContainerSnapshotDTO[]);
    }
    if (event.type === "docker-images" && event.serverId === serverId) {
      setImages(event.images as DockerImageDTO[]);
    }
  });

  const containerRows: ContainerWithServerDTO[] = (containers ?? []).map((c) => ({
    ...c,
    id: `${serverId}-${c.containerId}`,
    serverId,
    serverName: server?.name ?? "",
    timestamp: new Date().toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/servers/${serverId}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Docker · {server?.name ?? "…"}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {server && !server.dockerEnabled ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Container className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              {t("dockerDisabled")}{" "}
              <Link href={`/servers/${serverId}`} className="underline">
                {t("enableInSettings")}
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="containers">
          <TabsList>
            <TabsTrigger value="containers">
              <Container className="size-4" />
              Container
            </TabsTrigger>
            <TabsTrigger value="images">
              <Layers className="size-4" />
              Images
            </TabsTrigger>
          </TabsList>

          <TabsContent value="containers" className="space-y-3 pt-3">
            {canControl && (
              <div className="flex justify-end">
                <CreateContainerDialog serverId={serverId} images={images ?? []} onDone={load} />
              </div>
            )}
            {containers === null ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : containerRows.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  {t("noContainers")}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {containerRows.map((c) => (
                  <DockerRow
                    key={c.containerId}
                    container={c}
                    canControl={canControl}
                    href={`/docker/${serverId}/${c.containerId}`}
                    onDone={load}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="images" className="space-y-3 pt-3">
            {canControl && (
              <div className="flex justify-end">
                <PullImageDialog serverId={serverId} onDone={load} />
              </div>
            )}
            {images === null ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : images.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  {t("noImages")}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {images.map((img) => (
                  <ImageRow
                    key={img.id}
                    serverId={serverId}
                    image={img}
                    canControl={canControl}
                    onDone={load}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
