import type { ServerType } from "../lib/types";

const blocks: Record<ServerType, string> = {
  vanilla: "grass_block",
  paper: "birch_log",
  fabric: "oak_log",
  neoforge: "cobblestone",
  forge: "furnace",
  spigot: "bricks",
};

/** Locally bundled inventory-style renders. See public/blocks/ATTRIBUTION.md. */
export default function MinecraftBlock({ type }: { type: ServerType }) {
  return <img className="minecraft-block" src={`/blocks/${blocks[type]}.png`} width={36} height={36} alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
