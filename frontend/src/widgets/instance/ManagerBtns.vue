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
  CloudDownloadOutlined,
  BarChartOutlined,
  ThunderboltOutlined
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

// 將按鈕依據功能分組，並保留原本的 condition 權限過濾
const categorizedBtns = computed(() => {
  if (!instanceInfo.value) return [];

  const groups = [
    {
      groupName: t("基礎管理"),
      items: arrayFilter([
        {
          title: t("TXT_CODE_d07742fe"), // 配置文件
          icon: ControlOutlined,
          condition: () => !isGlobalTerminal.value && !!serverConfigFiles.value && serverConfigFiles.value?.length > 0,
          click: (): void => {
            toPage({
              path: "/instances/terminal/serverConfig",
              query: { type: instanceInfo.value?.config.type }
            });
          }
        },
        {
          title: t("TXT_CODE_ae533703"), // 檔案管理
          icon: FolderOpenOutlined,
          click: () => { toPage({ path: "/instances/terminal/files" }); },
          condition: () => state.settings.canFileManager || isAdmin.value
        },
        {
          title: t("備份管理"),
          icon: HistoryOutlined,
          click: () => { backupDialog.value?.openDialog(); },
          condition: () => state.settings.canFileManager || isAdmin.value
        },
        {
          title: t("統計圖表"),
          icon: BarChartOutlined, // 優化為圖表專用圖標
          click: () => { chartDialog.value?.openDialog(); },
          condition: () => state.settings.canFileManager || isAdmin.value
        }
      ])
    },
    {
      groupName: t("Minecraft 專區"),
      items: arrayFilter([
        {
          title: t("玩家管理"),
          icon: UsergroupDeleteOutlined,
          click: async () => {
            if (!terminalHook.isConnect.value) {
              try {
                await terminalHook.execute({ instanceId: instanceId!, daemonId: daemonId! });
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
          title: t("快捷指令"),
          icon: ThunderboltOutlined, // 採用原註解建議的閃電圖標
          click: async () => {
            if (!terminalHook.isConnect.value) {
              try {
                await terminalHook.execute({ instanceId: instanceId!, daemonId: daemonId! });
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
          title: t("TXT_CODE_40241d8e"), // Minecraft 設定 (Ping/MOTD等)
          icon: ControlOutlined,
          click: () => { mcSettingsDialog.value?.openDialog(); },
          condition: () => isAdmin.value && (instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false)
        },
        {
          title: t("切換 Java"),
          icon: CoffeeOutlined,
          click: () => { javaDialog.value?.openDialog(); },
          condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
        },
        {
          title: t("Modpack 自動化安裝"),
          icon: CloudDownloadOutlined,
          click: () => { cfInstallDialog.value?.openDialog(); },
          condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
        },
        {
          title: t("ModLoader 自動化安裝"),
          icon: CloudDownloadOutlined,
          click: () => { modloaderinstallDialog.value?.openDialog(); },
          condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
        },
        {
          title: t("存檔替換 / 匯入"),
          icon: SaveOutlined,
          click: () => { worldchangeDialog.value?.openDialog(); },
          condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
        },
        {
          title: t("自定義域名"),
          icon: GlobalOutlined,
          click: () => { srvDialog.value?.openDialog(); },
          condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
        }
      ])
    },
    {
      groupName: t("進階與高級設定"),
      items: arrayFilter([
        {
          title: t("TXT_CODE_656a85d8"), // Steam Rcon 設定
          icon: BuildOutlined,
          click: () => { rconSettingsDialog.value?.openDialog(); },
          condition: () => instanceInfo.value?.config.type.includes(TYPE_STEAM_SERVER_UNIVERSAL) ?? false
        },
        {
          title: t("TXT_CODE_d23631cb"), // 終端機設定
          icon: CodeOutlined,
          click: () => { terminalConfigDialog.value?.openDialog(); }
        },
        {
          title: t("TXT_CODE_b7d026f8"), // 排程任務
          icon: FieldTimeOutlined,
          condition: () => !isGlobalTerminal.value,
          click: () => {
            toPage({
              path: "/instances/schedule",
              query: { instanceId, daemonId }
            });
          }
        },
        {
          title: t("TXT_CODE_d341127b"), // 事件配置
          icon: DashboardOutlined,
          click: () => { eventConfigDialog.value?.openDialog(); }
        },
        {
          title: t("TXT_CODE_4f34fc28"), // 實例詳細設定 (管理員)
          icon: AppstoreAddOutlined,
          condition: () => isAdmin.value,
          click: () => { instanceDetailsDialog.value?.openDialog(); }
        },
        {
          title: t("TXT_CODE_4f34fc28"), // 實例基礎設定 (Docker普通用戶)
          icon: AppstoreAddOutlined,
          condition: () => !isAdmin.value && instanceInfo.value?.config.processType === "docker" && state.settings.allowChangeCmd,
          click: () => { instanceFundamentalDetailDialog.value?.openDialog(); }
        }
      ])
    }
  ];

  // 過濾掉內部沒有任何可用按鈕的分組
  return groups.filter(g => g.items.length > 0);
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
      <div class="scroll-container">
        <div v-for="group in categorizedBtns" :key="group.groupName" class="category-group">
          <div class="category-title">{{ group.groupName }}</div>
          
          <ResponsiveLayoutGroup class="function-btns-container" :items="group.items">
            <template #default="{ item }">
              <InnerCard
                :style="{ height: LayoutCardHeight.MINI }"
                :icon="item.icon"
                @click="item.click"
              >
                <template #title>
                  {{ item.title }}
                </template>
                <template #body>
                  <a href="javascript:void(0);">
                    <span>
                      {{ t("TXT_CODE_6c5985ca") }}
                      <ArrowRightOutlined style="font-size: 12px" />
                    </span>
                  </a>
                </template>
              </InnerCard>
            </template>
          </ResponsiveLayoutGroup>
        </div>
      </div>
    </template>
  </CardPanel>

  <TermConfig ref="terminalConfigDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" @update="refreshInstanceInfo" />
  <EventConfig ref="eventConfigDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" @update="refreshInstanceInfo" />
  <PingConfig ref="pingConfigDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" @update="refreshInstanceInfo" />
  <InstanceDetail ref="instanceDetailsDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" @update="refreshInstanceInfo" />
  <InstanceFundamentalDetail ref="instanceFundamentalDetailDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" @update="refreshInstanceInfo" />
  <RconSettings ref="rconSettingsDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" @update="refreshInstanceInfo" />
  <McPingSettings ref="mcSettingsDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" @update="refreshInstanceInfo" />
  <backup ref="backupDialog" :instance-id="instanceId ?? ''" :daemon-id="daemonId ?? ''" @save="refreshInstanceInfo" />
  <java ref="javaDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" @update="refreshInstanceInfo" />
  <srv ref="srvDialog" :instance-info="instanceInfo" :instance-id="instanceId ?? ''" :daemon-id="daemonId ?? ''" @update="refreshInstanceInfo" />
  <playermanagement ref="playermanagementDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" :use-terminal-hook="terminalHook" @update="refreshInstanceInfo" />
  <oftencommand ref="oftencommandDialog" :instance-info="instanceInfo" :instance-id="instanceId" :daemon-id="daemonId" :use-terminal-hook="terminalHook" @update="refreshInstanceInfo" />
  <worldchange ref="worldchangeDialog" :instance-id="instanceId ?? ''" :daemon-id="daemonId ?? ''" @save="refreshInstanceInfo" />
  <CurseForgeInstall ref="cfInstallDialog" :instance-id="instanceId ?? ''" :daemon-id="daemonId ?? ''" :instance-info="instanceInfo" />
  <modloaderinstall ref="modloaderinstallDialog" :instance-id="instanceId ?? ''" :daemon-id="daemonId ?? ''" :instance-info="instanceInfo" />
  <chart ref="chartDialog" :instance-id="instanceId ?? ''" :daemon-id="daemonId ?? ''" :instance-info="instanceInfo" />
</template>

<style lang="scss" scoped>
.scroll-container {
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}

.category-group {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
}

.category-title {
  font-size: 13px;
  // 使用 Ant Design 原生變數，自動適應 MCSManager 的深淺色主題
  color: var(--color-text-secondary, rgba(0, 0, 0, 0.45));
  margin-bottom: 10px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.function-btns-container {
  // 移除原本的 position: absolute 防止多個分組重疊
  position: relative;
  width: 100%;
}
</style>
