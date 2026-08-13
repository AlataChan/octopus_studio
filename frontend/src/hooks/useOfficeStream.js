import { useEffect, useRef } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import Office from "@/models/office";
import { baseHeaders } from "@/utils/request";
import { useOfficeStore } from "@/store/officeStore";

const MAX_RETRIES = 20;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

function backoffDelay(attempt) {
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

export default function useOfficeStream() {
  const connectVersion = useOfficeStore((state) => state.connectVersion);

  const attemptRef = useRef(0);
  const abortedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    abortedRef.current = false;
    attemptRef.current = 0;

    const {
      setConnectionStatus,
      setReconnectAttempt,
      applySnapshot,
      updateActor,
      addActor,
      beginRemoveActor,
      updateLinks,
    } = useOfficeStore.getState();

    setConnectionStatus("connecting");

    function connect() {
      if (abortedRef.current) return;

      const headers = baseHeaders();
      if (!headers.Authorization) {
        delete headers.Authorization;
      }

      void fetchEventSource(Office.sseUrl(), {
        method: "GET",
        headers,
        signal: controller.signal,

        onopen: async () => {
          attemptRef.current = 0;
          setReconnectAttempt(0);
          setConnectionStatus("connected");
        },

        onmessage: (event) => {
          if (!event.data) return;

          try {
            const data = JSON.parse(event.data);
            switch (event.event) {
              case "office.snapshot":
                applySnapshot(data);
                break;
              case "office.actor.updated":
                updateActor(data.actorId, data.patch || {});
                break;
              case "office.actor.online":
                addActor(data.actor);
                break;
              case "office.actor.offline":
                beginRemoveActor(data.actorId);
                break;
              case "office.link.updated":
                updateLinks(data.links || []);
                break;
              case "office.metrics":
                for (const actorMetric of data.actors || []) {
                  updateActor(actorMetric.actorId, {
                    metrics: actorMetric.metrics,
                  });
                }
                break;
              default:
                break;
            }
          } catch (error) {
            console.error("Failed to parse office SSE event:", error);
          }
        },

        onclose: () => {
          scheduleReconnect();
        },

        onerror: (error) => {
          console.error("Office stream error:", error);
          scheduleReconnect();
          throw error;
        },
      }).catch((error) => {
        if (!abortedRef.current) {
          console.error("Office stream request failed:", error);
        }
      });
    }

    function scheduleReconnect() {
      if (abortedRef.current) return;

      const attempt = attemptRef.current;
      if (attempt >= MAX_RETRIES) {
        setConnectionStatus("failed");
        return;
      }

      const delay = backoffDelay(attempt);
      attemptRef.current = attempt + 1;
      setReconnectAttempt(attempt + 1);
      setConnectionStatus("connecting");

      setTimeout(() => {
        if (!abortedRef.current) {
          connect();
        }
      }, delay);
    }

    connect();

    return () => {
      abortedRef.current = true;
      controller.abort();
      setConnectionStatus("disconnected");
    };
  }, [connectVersion]);
}
