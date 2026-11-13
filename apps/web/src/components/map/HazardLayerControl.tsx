import { CheckCircle, Circle } from "@phosphor-icons/react";

import type { MapLayerId } from "@/types";

export interface HazardLayerControlProps {
  activeLayer: MapLayerId;
  onLayerChange: (layer: MapLayerId) => void;
}

const layers: Array<{
  id: MapLayerId;
  label: string;
  description: string;
}> = [
  {
    id: "experimental",
    label: "Experimental outlook",
    description: "Dynamic model forecast",
  },
  {
    id: "static",
    label: "Static hazard susceptibility",
    description: "Fixed baseline, long-term",
  },
];

export function HazardLayerControl({
  activeLayer,
  onLayerChange,
}: HazardLayerControlProps) {
  return (
    <fieldset
      aria-labelledby="map-layers-title"
      className="w-[250px] rounded-panel border border-line bg-canvas-soft/95 p-4 text-ink shadow-xl backdrop-blur-sm"
    >
      <p
        id="map-layers-title"
        className="text-section border-b border-line pb-2"
      >
        Map layers
      </p>
      <div className="mt-2 grid">
        {layers.map((layer, index) => {
          const selected = activeLayer === layer.id;
          const Icon = selected ? CheckCircle : Circle;

          return (
            <label
              key={layer.id}
              className={`flex cursor-pointer gap-3 py-3 ${
                index === 0 ? "border-b border-line" : ""
              }`}
            >
              <input
                type="radio"
                name="map-layer"
                value={layer.id}
                checked={selected}
                onChange={() => onLayerChange(layer.id)}
                className="sr-only"
              />
              <Icon
                aria-hidden="true"
                size={21}
                weight={selected ? "fill" : "regular"}
                className={selected ? "text-brand-secondary" : "text-muted"}
              />
              <span>
                <span className="text-button block">{layer.label}</span>
                <span className="text-metadata mt-0.5 block text-muted">
                  {layer.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
