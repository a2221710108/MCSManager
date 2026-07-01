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
import updateserver from "./dialogs/updateserver.vue";
import respack from "./dialogs/respack.vue";
  
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
const updateserverDialog = ref<InstanceType<typeof updateserver>>();
const respackDialog = ref<InstanceType<typeof respack>>();
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

// 保持按鈕分組邏輯不變
const categorizedBtns = computed(() => {
  if (!instanceInfo.value) return [];

  const groups = [
    {
      groupName: t("基礎管理"),
      items: arrayFilter([
        {
          title: t("TXT_CODE_d07742fe"),
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
          title: t("TXT_CODE_ae533703"),
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
          icon: BarChartOutlined,
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
          icon: ThunderboltOutlined,
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
          title: t("TXT_CODE_40241d8e"),
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
          title: t("Server Core 自動化安裝"),
          icon: CloudDownloadOutlined,
          click: () => { modloaderinstallDialog.value?.openDialog(); },
          condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
        },
        {
          title: t("升/降級 Minecraft 版本"),
          icon: CloudDownloadOutlined,
          click: () => { updateserverDialog.value?.openDialog(); },
          condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
        },
        {
          title: t("上載材質包"),
          icon: SaveOutlined,
          click: () => { respackDialog.value?.openDialog(); },
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
          title: t("TXT_CODE_656a85d8"),
          icon: BuildOutlined,
          click: () => { rconSettingsDialog.value?.openDialog(); },
          condition: () => instanceInfo.value?.config.type.includes(TYPE_STEAM_SERVER_UNIVERSAL) ?? false
        },
        {
          title: t("TXT_CODE_d23631cb"),
          icon: CodeOutlined,
          click: () => { terminalConfigDialog.value?.openDialog(); }
        },
        {
          title: t("TXT_CODE_b7d026f8"),
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
          title: t("TXT_CODE_d341127b"),
          icon: DashboardOutlined,
          click: () => { eventConfigDialog.value?.openDialog(); }
        },
        {
          title: t("TXT_CODE_4f34fc28"),
          icon: AppstoreAddOutlined,
          condition: () => isAdmin.value,
          click: () => { instanceDetailsDialog.value?.openDialog(); }
        },
        {
          title: t("TXT_CODE_4f34fc28"),
          icon: AppstoreAddOutlined,
          condition: () => !isAdmin.value && instanceInfo.value?.config.processType === "docker" && state.settings.allowChangeCmd,
          click: () => { instanceFundamentalDetailDialog.value?.openDialog(); }
        }
      ])
    }
  ];

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
          <div class="category-header">
            <span class="category-title">{{ group.groupName }}</span>
            <div class="category-line"></div>
          </div>
          
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
  <respack ref="respackDialog" :instance-id="instanceId ?? ''" :daemon-id="daemonId ?? ''" :instance-info="instanceInfo" />
  <updateserver ref="updateserverDialog" :instance-id="instanceId ?? ''" :daemon-id="daemonId ?? ''" :instance-info="instanceInfo" />
</template>

<style lang="scss" scoped>
.scroll-container {
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}

.category-group {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

/* --- 借鑑 Java 組件的高階深淺色適配手法 --- */
.category-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.category-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;
  white-space: nowrap;
  
  /* 核心技巧：不寫死顏色，繼承 mcsm 當前文字基色並透過不透明度實現「淡字」效果 */
  color: inherit !important;
  opacity: 0.45; 
}

.category-line {
  flex: 1;
  height: 1px;
  /* 核心技巧：分隔線使用 10% 的環境文字色疊加，深色變淡白線，淺色變淡黑線 */
  background: currentColor;
  opacity: 0.1;
}

.function-btns-container {
  position: relative;
  width: 100%;
}
</style>
