import { Info, MapPin, MapTrifold } from "@phosphor-icons/react";
import Image from "next/image";

import { supportedCities } from "@/data/dashboard";
import type { MapLayerId } from "@/types";

import { HazardLayerControl } from "./HazardLayerControl";

export interface RiverMapProps {
  activeLayer: MapLayerId;
  onLayerChange: (layer: MapLayerId) => void;
}

export function RiverMap({ activeLayer, onLayerChange }: RiverMapProps) {
  return (
    <section
      id="map-workspace"
      aria-labelledby="map-title"
      data-dashboard-section
      className="relative min-h-[700px] overflow-hidden rounded-panel bg-line min-[1180px]:min-h-[760px]"
    >
      <Image
        src="/maps/ncr-illustrative-background.png"
        alt="Illustrative NCR development-coverage map with four highlighted city areas"
        fill
        priority
        sizes="(min-width: 1280px) 55vw, 100vw"
        className="object-cover object-[48%_42%]"
      />

      <div className="absolute top-5 left-5 rounded-control bg-canvas-soft/90 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <MapTrifold aria-hidden="true" size={22} weight="duotone" />
          <div>
            <h2 id="map-title" className="text-section">
              NCR (Metro Manila)
            </h2>
            <p className="text-metadata mt-0.5 text-muted">
              Experimental flood-risk workspace
            </p>
          </div>
        </div>
      </div>

      <div className="absolute top-5 right-5 hidden lg:block">
        <HazardLayerControl
          activeLayer={activeLayer}
          onLayerChange={onLayerChange}
        />
      </div>

      {supportedCities.map((city) => (
        <div
          key={city.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={city.mapPosition}
        >
          <span
            className={`flex items-center gap-1.5 rounded-control px-2.5 py-1.5 shadow-lg ${
              city.selected
                ? "bg-danger text-white"
                : "bg-canvas-soft/92 text-ink"
            }`}
          >
            <MapPin aria-hidden="true" size={15} weight="fill" />
            <span className="text-button whitespace-nowrap">{city.name}</span>
          </span>
        </div>
      ))}

      <div className="absolute right-4 bottom-28 left-4 flex flex-col items-stretch justify-between gap-3 sm:right-5 sm:bottom-24 sm:left-5 lg:flex-row lg:items-end">
        <div className="w-full rounded-panel border border-line bg-canvas-soft/95 p-4 text-ink shadow-lg backdrop-blur-sm lg:max-w-[260px]">
          <p className="text-button">
            {activeLayer === "experimental"
              ? "Experimental outlook"
              : "Static hazard susceptibility"}
          </p>
          <div className="text-metadata mt-3 grid gap-2 text-muted">
            {activeLayer === "experimental" ? (
              <>
                <p className="flex items-center gap-2">
                  <span className="size-3 rounded-sm bg-danger" /> Higher
                  (sample)
                </p>
                <p className="flex items-center gap-2">
                  <span className="size-3 rounded-sm bg-warning" /> Moderate
                  (sample)
                </p>
                <p className="flex items-center gap-2">
                  <span className="size-3 rounded-sm bg-brand-secondary-muted" />
                  Lower (sample)
                </p>
              </>
            ) : (
              <p>
                Baseline context only. This layer does not represent a dated
                forecast.
              </p>
            )}
            <p className="border-t border-line pt-2 text-muted">
              Illustrative spatial preview—not a surveyed hazard boundary.
            </p>
          </div>
        </div>

        <div className="flex max-w-sm items-start gap-3 rounded-panel bg-canvas-soft/90 p-4 text-ink backdrop-blur-sm">
          <Info aria-hidden="true" size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-button">City-level daily coverage</p>
            <p className="text-metadata mt-1 text-muted">
              Experimental outlook: Nov 11–17, 2026
            </p>
            <p className="text-metadata mt-0.5 text-muted">
              Static hazard: baseline (multi-year)
            </p>
          </div>
        </div>
      </div>

      <div className="absolute right-0 bottom-0 left-0 grid gap-px bg-line text-ink sm:grid-cols-[190px_repeat(4,1fr)]">
        <div className="bg-canvas-soft/95 px-4 py-3 backdrop-blur-sm">
          <p className="text-button">Data availability</p>
          <p className="text-metadata mt-0.5 text-muted">
            NCR supported cities
          </p>
        </div>
        {supportedCities.map((city) => (
          <div
            key={city.id}
            className="hidden bg-canvas-soft/95 px-3 py-3 backdrop-blur-sm sm:block"
          >
            <p className="text-metadata flex items-center gap-2 text-ink">
              <span className="size-2 rounded-full bg-success" /> {city.name}
            </p>
            <p className="text-metadata mt-1 text-muted">{city.status}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
