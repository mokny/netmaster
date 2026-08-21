import type { AppLocale } from "@/lib/locale";
import type { PushPayload } from "@/lib/push";
import type { MetricKey } from "@/lib/monitor/status";

// Push-Notification-Texte pro Empfänger-Sprache. Anders als der Rest der App
// (next-intl über Server/Client Components) laufen diese Templates in reinem
// Server-Code (Cron/SSH-Poll-Loop, kein Request-Kontext) - next-intl kann
// hier keine Locale aus Cookie/Header ziehen, deshalb ein eigenes, kleines
// Dictionary statt next-intl. Aufrufer übergeben die Locale des jeweiligen
// Empfängers explizit (siehe sendPushToUser in push.ts).

export type PushMessageKey =
  | "serverOffline"
  | "serverOfflineRecovered"
  | "metricCritical"
  | "metricWarning"
  | "metricRecovered"
  | "dockerContainerStopped"
  | "dockerContainerRecovered"
  | "checkDown"
  | "checkSlow"
  | "checkRecovered"
  | "checkFastAgain";

export interface PushMessageDescriptor {
  key: PushMessageKey;
  params?: Record<string, string | number | undefined>;
  url?: string;
}

const METRIC_LABELS: Record<AppLocale, Record<MetricKey, string>> = {
  en: { cpu: "CPU usage", mem: "Memory usage", disk: "Disk usage", net: "Network throughput" },
  de: { cpu: "CPU-Auslastung", mem: "RAM-Auslastung", disk: "Disk-Auslastung", net: "Netzwerk-Durchsatz" },
  nl: { cpu: "CPU-gebruik", mem: "Geheugengebruik", disk: "Schijfgebruik", net: "Netwerkdoorvoer" },
  fr: { cpu: "Utilisation du CPU", mem: "Utilisation de la mémoire", disk: "Utilisation du disque", net: "Débit réseau" },
  es: { cpu: "Uso de CPU", mem: "Uso de memoria", disk: "Uso de disco", net: "Rendimiento de red" },
};

type Params = { serverName: string; metric?: MetricKey; containerName?: string; state?: string; checkName?: string; checkUrl?: string; latencyMs?: number; detail?: string };

type Template = (locale: AppLocale, p: Params) => { title: string; body: string };

const templates: Record<PushMessageKey, Template> = {
  serverOffline: (locale, p) => ({
    title: {
      en: `${p.serverName}: unreachable`,
      de: `${p.serverName}: nicht erreichbar`,
      nl: `${p.serverName}: niet bereikbaar`,
      fr: `${p.serverName} : injoignable`,
      es: `${p.serverName}: inaccesible`,
    }[locale],
    body:
      p.detail ??
      {
        en: `${p.serverName} is not responding.`,
        de: `${p.serverName} antwortet nicht.`,
        nl: `${p.serverName} reageert niet.`,
        fr: `${p.serverName} ne répond pas.`,
        es: `${p.serverName} no responde.`,
      }[locale],
  }),
  serverOfflineRecovered: (locale, p) => ({
    title: {
      en: `${p.serverName}: reachable again`,
      de: `${p.serverName}: wieder erreichbar`,
      nl: `${p.serverName}: weer bereikbaar`,
      fr: `${p.serverName} : de nouveau joignable`,
      es: `${p.serverName}: accesible de nuevo`,
    }[locale],
    body: {
      en: `${p.serverName} is responding again.`,
      de: `${p.serverName} antwortet wieder.`,
      nl: `${p.serverName} reageert weer.`,
      fr: `${p.serverName} répond à nouveau.`,
      es: `${p.serverName} vuelve a responder.`,
    }[locale],
  }),
  metricCritical: (locale, p) => {
    const label = METRIC_LABELS[locale][p.metric!];
    return {
      title: {
        en: `${p.serverName}: ${label} critical`,
        de: `${p.serverName}: ${label} kritisch`,
        nl: `${p.serverName}: ${label} kritiek`,
        fr: `${p.serverName} : ${label} critique`,
        es: `${p.serverName}: ${label} crítico`,
      }[locale],
      body: {
        en: `${label} is in the critical range.`,
        de: `${label} liegt im kritischen Bereich.`,
        nl: `${label} bevindt zich in het kritieke bereik.`,
        fr: `${label} est dans la zone critique.`,
        es: `${label} está en el rango crítico.`,
      }[locale],
    };
  },
  metricWarning: (locale, p) => {
    const label = METRIC_LABELS[locale][p.metric!];
    return {
      title: {
        en: `${p.serverName}: ${label} warning`,
        de: `${p.serverName}: ${label} Warnung`,
        nl: `${p.serverName}: ${label} waarschuwing`,
        fr: `${p.serverName} : alerte ${label}`,
        es: `${p.serverName}: aviso de ${label}`,
      }[locale],
      body: {
        en: `${label} is in the warning range.`,
        de: `${label} liegt im Warnbereich.`,
        nl: `${label} bevindt zich in het waarschuwingsbereik.`,
        fr: `${label} est dans la zone d'alerte.`,
        es: `${label} está en el rango de aviso.`,
      }[locale],
    };
  },
  metricRecovered: (locale, p) => {
    const label = METRIC_LABELS[locale][p.metric!];
    return {
      title: {
        en: `${p.serverName}: ${label} back to normal`,
        de: `${p.serverName}: ${label} wieder normal`,
        nl: `${p.serverName}: ${label} weer normaal`,
        fr: `${p.serverName} : ${label} redevenu normal`,
        es: `${p.serverName}: ${label} normal de nuevo`,
      }[locale],
      body: {
        en: `${label} is back in the normal range.`,
        de: `${label} ist wieder im Normalbereich.`,
        nl: `${label} bevindt zich weer in het normale bereik.`,
        fr: `${label} est revenu dans la plage normale.`,
        es: `${label} volvió al rango normal.`,
      }[locale],
    };
  },
  dockerContainerStopped: (locale, p) => ({
    title: {
      en: `${p.serverName}: container stopped`,
      de: `${p.serverName}: Container gestoppt`,
      nl: `${p.serverName}: container gestopt`,
      fr: `${p.serverName} : conteneur arrêté`,
      es: `${p.serverName}: contenedor detenido`,
    }[locale],
    body: {
      en: `Container "${p.containerName}" is no longer running (status: ${p.state}).`,
      de: `Container "${p.containerName}" läuft nicht mehr (Status: ${p.state}).`,
      nl: `Container "${p.containerName}" draait niet meer (status: ${p.state}).`,
      fr: `Le conteneur « ${p.containerName} » ne fonctionne plus (statut : ${p.state}).`,
      es: `El contenedor "${p.containerName}" ya no se está ejecutando (estado: ${p.state}).`,
    }[locale],
  }),
  dockerContainerRecovered: (locale, p) => ({
    title: {
      en: `${p.serverName}: container restarted`,
      de: `${p.serverName}: Container wieder gestartet`,
      nl: `${p.serverName}: container opnieuw gestart`,
      fr: `${p.serverName} : conteneur redémarré`,
      es: `${p.serverName}: contenedor reiniciado`,
    }[locale],
    body: {
      en: `Container "${p.containerName}" is running again.`,
      de: `Container "${p.containerName}" läuft wieder.`,
      nl: `Container "${p.containerName}" draait weer.`,
      fr: `Le conteneur « ${p.containerName} » fonctionne à nouveau.`,
      es: `El contenedor "${p.containerName}" se está ejecutando de nuevo.`,
    }[locale],
  }),
  checkDown: (locale, p) => ({
    title: {
      en: `${p.checkName}: unreachable`,
      de: `${p.checkName} nicht erreichbar`,
      nl: `${p.checkName} niet bereikbaar`,
      fr: `${p.checkName} injoignable`,
      es: `${p.checkName}: inaccesible`,
    }[locale],
    body:
      p.detail ||
      {
        en: `${p.checkUrl} is not responding as expected.`,
        de: `${p.checkUrl} antwortet nicht wie erwartet.`,
        nl: `${p.checkUrl} reageert niet zoals verwacht.`,
        fr: `${p.checkUrl} ne répond pas comme prévu.`,
        es: `${p.checkUrl} no responde como se esperaba.`,
      }[locale],
  }),
  checkSlow: (locale, p) => ({
    title: {
      en: `${p.checkName}: slow response`,
      de: `${p.checkName}: langsame Antwort`,
      nl: `${p.checkName}: trage reactie`,
      fr: `${p.checkName} : réponse lente`,
      es: `${p.checkName}: respuesta lenta`,
    }[locale],
    body: {
      en: `Response time is above the configured threshold (${p.latencyMs}ms).`,
      de: `Antwortzeit liegt über dem konfigurierten Schwellwert (${p.latencyMs}ms).`,
      nl: `Reactietijd ligt boven de ingestelde drempel (${p.latencyMs}ms).`,
      fr: `Le temps de réponse dépasse le seuil configuré (${p.latencyMs} ms).`,
      es: `El tiempo de respuesta supera el umbral configurado (${p.latencyMs}ms).`,
    }[locale],
  }),
  checkRecovered: (locale, p) => ({
    title: {
      en: `${p.checkName}: reachable again`,
      de: `${p.checkName}: wieder erreichbar`,
      nl: `${p.checkName}: weer bereikbaar`,
      fr: `${p.checkName} : de nouveau joignable`,
      es: `${p.checkName}: accesible de nuevo`,
    }[locale],
    body: {
      en: `${p.checkUrl} is responding as expected again.`,
      de: `${p.checkUrl} antwortet wieder wie erwartet.`,
      nl: `${p.checkUrl} reageert weer zoals verwacht.`,
      fr: `${p.checkUrl} répond de nouveau comme prévu.`,
      es: `${p.checkUrl} vuelve a responder como se esperaba.`,
    }[locale],
  }),
  checkFastAgain: (locale, p) => ({
    title: {
      en: `${p.checkName}: fast again`,
      de: `${p.checkName}: wieder schnell`,
      nl: `${p.checkName}: weer snel`,
      fr: `${p.checkName} : de nouveau rapide`,
      es: `${p.checkName}: rápido de nuevo`,
    }[locale],
    body: {
      en: "Response time is back in the normal range.",
      de: "Antwortzeit ist wieder im normalen Bereich.",
      nl: "Reactietijd is weer normaal.",
      fr: "Le temps de réponse est revenu à la normale.",
      es: "El tiempo de respuesta volvió al rango normal.",
    }[locale],
  }),
};

export function buildPushPayload(locale: AppLocale, descriptor: PushMessageDescriptor): PushPayload {
  const { title, body } = templates[descriptor.key](locale, (descriptor.params ?? {}) as Params);
  return { title, body, url: descriptor.url };
}
