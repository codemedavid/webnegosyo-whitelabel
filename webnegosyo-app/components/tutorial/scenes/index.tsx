import type { ComponentType } from "react";
import type { SceneProps } from "./shared";
import { HomeScene } from "./HomeScene";
import { OrdersScene } from "./OrdersScene";
import { OrderDetailScene } from "./OrderDetailScene";
import { KitchenScene } from "./KitchenScene";
import { RegisterScene } from "./RegisterScene";
import { TenderScene } from "./TenderScene";
import { DrawerScene } from "./DrawerScene";
import { ProductsScene } from "./ProductsScene";
import { StockScene } from "./StockScene";
import { InsightsScene } from "./InsightsScene";
import { ToolsScene } from "./ToolsScene";
import { TeamScene } from "./TeamScene";
import { BranchesScene } from "./BranchesScene";

/**
 * Scene registry: a step's `scene.kind` names its full-screen simulation
 * here. The chapter registry's test reads this file, so a new kind must be
 * listed on its own line as `<kind>: <Name>Scene`.
 */
export const TUTORIAL_SCENES: Record<string, ComponentType<SceneProps>> = {
  home: HomeScene,
  orders: OrdersScene,
  orderDetail: OrderDetailScene,
  kitchen: KitchenScene,
  register: RegisterScene,
  tender: TenderScene,
  drawer: DrawerScene,
  products: ProductsScene,
  stock: StockScene,
  insights: InsightsScene,
  tools: ToolsScene,
  team: TeamScene,
  branches: BranchesScene,
};

export type { SceneProps } from "./shared";
