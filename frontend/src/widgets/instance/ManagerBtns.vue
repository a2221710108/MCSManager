<script setup lang="ts">
import InnerCard from "@/components/InnerCard.vue";
import ResponsiveLayoutGroup from "@/components/ResponsiveLayoutGroup.vue";
import { useAppRouters } from "@/hooks/useAppRouters";
import {
  TYPE_MINECRAFT_JAVA,
  TYPE_STEAM_SERVER_UNIVERSAL,
  useInstanceInfo
} from "@/hooks/useInstance";
import { useServerConfig } from "@/hooks/useServerConfig";
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import type { LayoutCard } from "@/types";
import {
  AppstoreAddOutlined,
  ArrowRightOutlined,
  BuildOutlined,
  CodeOutlined,
  ControlOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  FolderOpenOutlined,
  UsergroupDeleteOutlined,
  CoffeeOutlined,
  HistoryOutlined,
  GlobalOutlined,
  SaveOutlined,
  CloudDownloadOutlined
} from "@ant-design/icons-vue";
import { computed, ref, watch } from "vue";
import type { RouteLocationPathRaw } from "vue-router";
import { LayoutCardHeight } from "../../config/originLayoutConfig";
import { useLayoutCardTools } from "../../hooks/useCardTools";
import { arrayFilter } from "../../tools/array";
import EventConfig from "./dialogs/EventConfig.vue";
import InstanceDetail from "./dialogs/InstanceDetail.vue";
import InstanceFundamentalDetail from "./dialogs/InstanceFundamentalDetail.vue";
import McPingSettings from "./dialogs/McPingSettings.vue";
import PingConfig from "./dialogs/PingConfig.vue";
import RconSettings from "./dialogs/RconSettings.vue";
import TermConfig from "./dialogs/TermConfig.vue";
import backup from "./dialogs/backup.vue";
import java from "./dialogs/java.vue";
import srv from "./dialogs/srv.vue";
import playermanagement from "./dialogs/playermanagement.vue";
import { useTerminal } from "@/hooks/useTerminal";
import oftencommand from "./dialogs/oftencommand.vue";
import worldchange from "./dialogs/worldchange.vue";
import CurseForgeInstall from "./dialogs/CurseForgeInstall.vue";
import modloaderinstall from "./dialogs/modloaderinstall.vue";
import chart from "./dialogs/chart.vue";

const terminalConfigDialog = ref<InstanceType<typeof TermConfig>>();
const rconSettingsDialog = ref<InstanceType<typeof RconSettings>>();
const mcSettingsDialog = ref<InstanceType<typeof McPingSettings>>();
const eventConfigDialog = ref<InstanceType<typeof EventConfig>>();
const pingConfigDialog = ref<InstanceType<typeof PingConfig>>();
const instanceDetailsDialog = ref<InstanceType<typeof InstanceDetail>>();
const instanceFundamentalDetailDialog = ref<InstanceType<typeof InstanceFundamentalDetail>>();
const backupDialog = ref<InstanceType<typeof backup>>();
const javaDialog = ref<InstanceType<typeof java>>();
const srvDialog = ref<InstanceType<typeof srv>>();
const playermanagementDialog = ref<InstanceType<typeof playermanagement>>();
const oftencommandDialog = ref<InstanceType<typeof oftencommand>>();
const worldchangeDialog = ref<InstanceType<typeof worldchange>>();
const cfInstallDialog = ref<InstanceType<typeof CurseForgeInstall>>();
const modloaderinstallDialog = ref<InstanceType<typeof modloaderinstall>>();
const chartDialog = ref<InstanceType<typeof chart>>();
const terminalHook = useTerminal();

const { toPage: toOtherPager } = useAppRouters();
const props = defineProps<{
  card: LayoutCard;
}>();
const { isAdmin, state } = useAppStateStore();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);
const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");
const { instanceInfo, execute, isGlobalTerminal } = useInstanceInfo({
  instanceId,
  daemonId,
  autoRefresh: true
});
const { serverConfigFiles, refresh: refreshServerConfig } = useServerConfig();
const toPage = (params: RouteLocationPathRaw) => {
  if (!params.query) params.query = {};
  params.query = {
    ...params.query,
    instanceId,
    daemonId
  };
  toOtherPager(params);
};
const refreshInstanceInfo = async () => {
  await execute({
    params: {
      uuid: instanceId ?? "",
      daemonId: daemonId ?? ""
    },
    forceRequest: true
  });
};

// 定義按鈕分類（順序即顯示順序）
const categoryOrder = ["基本管理", "終端與連線", "Minecraft 功能", "備份與分析"];

// 原始按鈕定義，添加 category 屬性
const btns = computed(() => {
  if (!instanceInfo.value) return [];
  return arrayFilter([
    // ---------- 基本管理 ----------
    {
      title: t("TXT_CODE_d07742fe"),
      icon: ControlOutlined,
      category: "基本管理",
      condition: () => {
        return (
          !isGlobalTerminal.value &&
          !!serverConfigFiles.value &&
          serverConfigFiles.value?.length > 0
        );
      },
      click: (): void => {
        toPage({
          path: "/instances/terminal/serverConfig",
          query: {
            type: instanceInfo.value?.config.type
          }
        });
      }
    },
    {
      title: t("TXT_CODE_ae533703"),
      icon: FolderOpenOutlined,
      category: "基本管理",
      click: () => {
        toPage({ path: "/instances/terminal/files" });
      },
      condition: () => state.settings.canFileManager || isAdmin.value
    },
    {
      title: t("TXT_CODE_b7d026f8"),
      icon: FieldTimeOutlined,
      category: "基本管理",
      condition: () => !isGlobalTerminal.value,
      click: () => {
        toPage({
          path: "/instances/schedule",
          query: {
            instanceId,
            daemonId
          }
        });
      }
    },
    {
      title: t("TXT_CODE_d341127b"),
      icon: DashboardOutlined,
      category: "基本管理",
      click: () => {
        eventConfigDialog.value?.openDialog();
      }
    },
    {
      title: t("TXT_CODE_4f34fc28"),
      icon: AppstoreAddOutlined,
      category: "基本管理",
      condition: () => isAdmin.value,
      click: () => {
        instanceDetailsDialog.value?.openDialog();
      }
    },
    {
      title: t("TXT_CODE_4f34fc28"), // 注意：與上一個重名，建議後續用不同 key
      icon: AppstoreAddOutlined,
      category: "基本管理",
      condition: () =>
        !isAdmin.value &&
        instanceInfo.value?.config.processType === "docker" &&
        state.settings.allowChangeCmd,
      click: () => {
        instanceFundamentalDetailDialog.value?.openDialog();
      }
    },
    // ---------- 終端與連線 ----------
    {
      title: t("TXT_CODE_40241d8e"),
      icon: UsergroupDeleteOutlined,
      category: "終端與連線",
      click: () => {
        mcSettingsDialog.value?.openDialog();
      },
      condition: () => isAdmin.value && (instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false)
    },
    {
      title: t("TXT_CODE_656a85d8"),
      icon: BuildOutlined,
      category: "終端與連線",
      click: () => {
        rconSettingsDialog.value?.openDialog();
      },
      condition: () =>
        instanceInfo.value?.config.type.includes(TYPE_STEAM_SERVER_UNIVERSAL) ?? false
    },
    {
      title: t("TXT_CODE_d23631cb"),
      icon: CodeOutlined,
      category: "終端與連線",
      click: () => {
        terminalConfigDialog.value?.openDialog();
      }
    },
    // ---------- Minecraft 功能 ----------
    {
      title: t("快捷指令"),
      icon: ControlOutlined,
      category: "Minecraft 功能",
      click: async () => {
        if (!terminalHook.isConnect.value) {
          try {
            await terminalHook.execute({
              instanceId: instanceId!,
              daemonId: daemonId!
            });
          } catch (err) {
            console.error("OftenCommand Connection Failed:", err);
            return;
          }
        }
        oftencommandDialog.value?.openDialog();
      },
      condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
    },
    {
      title: t("玩家管理"),
      icon: UsergroupDeleteOutlined,
      category: "Minecraft 功能",
      click: async () => {
        if (!terminalHook.isConnect.value) {
          try {
            await terminalHook.execute({
              instanceId: instanceId!,
              daemonId: daemonId!
            });
          } catch (err) {
            console.error("PlayerManager Connection Failed:", err);
            return;
          }
        }
        playermanagementDialog.value?.openDialog();
      },
      condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
    },
    {
      title: t("切換 Java"),
      icon: CoffeeOutlined,
      category: "Minecraft 功能",
      click: () => {
        javaDialog.value?.openDialog();
      },
      condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
    },
    {
      title: t("Modpack 自動化安裝"),
      icon: CloudDownloadOutlined,
      category: "Minecraft 功能",
      click: () => {
        cfInstallDialog.value?.openDialog();
      },
      condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
    },
    {
      title: t("ModLoader 自動化安裝"),
      icon: CloudDownloadOutlined,
      category: "Minecraft 功能",
      click: () => {
        modloaderinstallDialog.value?.openDialog();
      },
      condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
    },
    {
      title: t("存檔替換 / 匯入"),
      icon: SaveOutlined,
      category: "Minecraft 功能",
      click: () => {
        worldchangeDialog.value?.openDialog();
      },
      condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
    },
    {
      title: t("自定義域名"),
      icon: GlobalOutlined,
      category: "Minecraft 功能",
      click: () => {
        srvDialog.value?.openDialog();
      },
      condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
    },
    // ---------- 備份與分析 ----------
    {
      title: t("備份管理"),
      icon: HistoryOutlined,
      category: "備份與分析",
      click: () => {
        backupDialog.value?.openDialog();
      },
      condition: () => state.settings.canFileManager || isAdmin.value
    },
    {
      title: t("統計圖表"),
      icon: HistoryOutlined,
      category: "備份與分析",
      click: () => {
        chartDialog.value?.openDialog();
      },
      condition: () => state.settings.canFileManager || isAdmin.value
    }
  ]);
});

// 按照分類分組，保持分類順序
const groupedBtns = computed(() => {
  const groups: Record<string, typeof btns.value> = {};
  btns.value.forEach((btn) => {
    const cat = btn.category || "其他";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(btn);
  });
  // 依照 categoryOrder 排序，未定義的分類放在最後
  const sorted: Record<string, typeof btns.value> = {};
  categoryOrder.forEach((cat) => {
    if (groups[cat]) sorted[cat] = groups[cat];
  });
  // 加入未在 categoryOrder 中的分類
  Object.keys(groups).forEach((cat) => {
    if (!sorted[cat]) sorted[cat] = groups[cat];
  });
  return sorted;
});

watch(instanceInfo, (cfg, oldCfg) => {
  if (cfg?.config?.type && instanceId && daemonId && cfg.config.type !== oldCfg?.config?.type) {
    refreshServerConfig(cfg.config.type, instanceId, daemonId);
  }
});
</script>

<template>
  <CardPanel class="containerWrapper" style="height: 100%">
    <template #title>{{ card.title }}</template>
    <template #body>
      <div class="function-categories">
        <div
          class="category-group"
          v-for="(items, category) in groupedBtns"
          :key="category"
        >
          <div class="category-label">{{ category }}</div>
          <div class="category-items">
            <InnerCard
              v-for="item in items"
              :key="item.title"
              :style="{ height: LayoutCardHeight.MINI }"
              :icon="item.icon"
              @click="item.click"
            >
              <template #title>{{ item.title }}</template>
              <template #body>
                <a href="javascript:void(0);">
                  <span>
                    {{ t("TXT_CODE_6c5985ca") }}
                    <ArrowRightOutlined style="font-size: 12px" />
                  </span>
                </a>
              </template>
            </InnerCard>
          </div>
        </div>
      </div>
    </template>
  </CardPanel>

  <!-- 所有對話框保持不變 -->
  <TermConfig
    ref="terminalConfigDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    @update="refreshInstanceInfo"
  />
  <EventConfig
    ref="eventConfigDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    @update="refreshInstanceInfo"
  />
  <PingConfig
    ref="pingConfigDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    @update="refreshInstanceInfo"
  />
  <InstanceDetail
    ref="instanceDetailsDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    @update="refreshInstanceInfo"
  />
  <InstanceFundamentalDetail
    ref="instanceFundamentalDetailDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    @update="refreshInstanceInfo"
  />
  <RconSettings
    ref="rconSettingsDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    @update="refreshInstanceInfo"
  />
  <McPingSettings
    ref="mcSettingsDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    @update="refreshInstanceInfo"
  />
  <backup
    ref="backupDialog"
    :instance-id="instanceId ?? ''"
    :daemon-id="daemonId ?? ''"
    @save="refreshInstanceInfo"
  />
  <java
    ref="javaDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    @update="refreshInstanceInfo"
  />
  <srv
    ref="srvDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId ?? ''"
    :daemon-id="daemonId ?? ''"
    @update="refreshInstanceInfo"
  />
  <playermanagement
    ref="playermanagementDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    :use-terminal-hook="terminalHook"
    @update="refreshInstanceInfo"
  />
  <oftencommand
    ref="oftencommandDialog"
    :instance-info="instanceInfo"
    :instance-id="instanceId"
    :daemon-id="daemonId"
    :use-terminal-hook="terminalHook"
    @update="refreshInstanceInfo"
  />
  <worldchange
    ref="worldchangeDialog"
    :instance-id="instanceId ?? ''"
    :daemon-id="daemonId ?? ''"
    @save="refreshInstanceInfo"
  />
  <CurseForgeInstall
    ref="cfInstallDialog"
    :instance-id="instanceId ?? ''"
    :daemon-id="daemonId ?? ''"
    :instance-info="instanceInfo"
  />
  <modloaderinstall
    ref="modloaderinstallDialog"
    :instance-id="instanceId ?? ''"
    :daemon-id="daemonId ?? ''"
    :instance-info="instanceInfo"
  />
  <chart
    ref="chartDialog"
    :instance-id="instanceId ?? ''"
    :daemon-id="daemonId ?? ''"
    :instance-info="instanceInfo"
  />
</template>

<style lang="scss" scoped>
.function-categories {
  height: 100%;
  overflow-y: auto;
  padding: 8px 0;
}

.category-group {
  margin-bottom: 24px;

  .category-label {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    padding: 0 8px 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .category-items {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 0 8px;
  }
}

/* 覆蓋原本絕對定位，改用 flex 排版 */
.containerWrapper {
  :deep(.ant-card-body) {
    padding-top: 8px;
    position: relative;
  }
}

.function-btns-container {
  position: static; /* 取消原本的絕對定位 */
}
</style>
