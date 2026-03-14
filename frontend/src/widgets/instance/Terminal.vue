<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import CardPanel from "@/components/CardPanel.vue";
import { openMarketDialog } from "@/components/fc";
import IconBtn from "@/components/IconBtn.vue";
import TerminalCore from "@/components/TerminalCore.vue";
import TerminalTags from "@/components/TerminalTags.vue";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { INSTANCE_TYPE_TRANSLATION, verifyEULA } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import {
  killInstance,
  openInstance,
  restartInstance,
  stopInstance,
  updateInstance
} from "@/services/apis/instance";
import { fileContent } from "@/services/apis/fileManager";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { sleep } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import { INSTANCE_STATUS } from "@/types/const";
import {
  ApartmentOutlined,
  BlockOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DownOutlined,
  InfoCircleOutlined,
  InteractionOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined
} from "@ant-design/icons-vue";
import { useLocalStorage } from "@vueuse/core";
import prettyBytes, { type Options as PrettyOptions } from "pretty-bytes";
import type { TagInfo } from "../../components/interface";
import { GLOBAL_INSTANCE_NAME } from "../../config/const";
import { useTerminal, type UseTerminalHook } from "../../hooks/useTerminal";
import { arrayFilter } from "../../tools/array";

const props = defineProps<{
  card: LayoutCard;
}>();

const { isPhone } = useScreen();
const { state, isAdmin } = useAppStateStore();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);

const terminalHook: UseTerminalHook = useTerminal();
const {
  state: instanceInfo,
  isStopped,
  isRunning,
  isBuys,
  isGlobalTerminal,
  isDockerMode,
  clearTerminal
} = terminalHook;

const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");
const viewType = getMetaOrRouteValue("viewType", false);
const innerTerminalType = computed(() => props.card.width === 12 && viewType === "inner");
const instanceTypeText = computed(
  () => INSTANCE_TYPE_TRANSLATION[instanceInfo.value?.config.type ?? -1]
);

const terminalCoreRef = ref();
const activeTab = ref("default");
const { execute: fetchFile } = fileContent();

const handleTabChange = async () => {
  if (activeTab.value === "default") {
    await nextTick();
    terminalCoreRef.value?.showDefaultView();
  } else {
    terminalCoreRef.value?.showLogView("", true);
    try {
      const res: any = await fetchFile({
        params: { daemonId: daemonId ?? "", uuid: instanceId ?? "" },
        data: { target: "logs/latest.log" }
      });

      let rawText = "";
      if (typeof res === "string") rawText = res;
      else if (res && typeof res === "object") {
        rawText = res._value || res.value || res.data || res.content || "";
      }

      const lines = rawText.split(/\r?\n/);
      const targetLevel = activeTab.value.toUpperCase(); 
      const resultLines: string[] = [];
      let isCapturing = false;

      const levelRegex = new RegExp(`(\\[|\\/)${targetLevel}(\\]|\\:)`, 'i');
      const timestampRegex = /\[\d{2}:\d{2}:\d{2}\]/;

      for (const line of lines) {
        if (!line.trim()) continue;
        const hasTimestamp = timestampRegex.test(line);
        const hasLevel = levelRegex.test(line);

        if (hasTimestamp) {
          if (hasLevel) {
            isCapturing = true;
            resultLines.push(line);
          } else {
            isCapturing = false;
          }
        } else if (isCapturing) {
          resultLines.push(line);
        }
      }
      
      terminalCoreRef.value?.showLogView(
        resultLines.length > 0 ? resultLines.join("\n") : `--- 未發現 ${targetLevel} ---`, 
        false
      );
    } catch (err: any) {
      terminalCoreRef.value?.showLogView("讀取失敗：" + err.message, false);
    }
  }
};

const { execute: requestOpenInstance, isLoading: isOpenInstanceLoading } = openInstance();
const toOpenInstance = async () => {
  clearTerminal();
  try {
    if (instanceInfo.value?.config?.type?.startsWith("minecraft/java")) {
      const flag = await verifyEULA(instanceId ?? "", daemonId ?? "");
      if (!flag) return;
      await sleep(1000);
    }
    await requestOpenInstance({ params: { uuid: instanceId ?? "", daemonId: daemonId ?? "" } });
  } catch (error: any) { reportErrorMsg(error); }
};

const updateCmd = computed(() => (instanceInfo.value?.config.updateCommand ? true : false));
const instanceStatusText = computed(() => INSTANCE_STATUS[instanceInfo.value?.status ?? -1]);

const quickOperations = computed(() =>
  arrayFilter([
    { title: t("啟動"), icon: PlayCircleOutlined, noConfirm: true, type: "default", class: "button-color-success", click: toOpenInstance, props: {}, condition: () => isStopped.value },
    { title: t("停止"), icon: PauseCircleOutlined, noConfirm: false, type: "default", class: "", click: async () => { try { await stopInstance().execute({ params: { uuid: instanceId || "", daemonId: daemonId || "" } }); } catch (error: any) { reportErrorMsg(error); } }, props: { danger: true }, condition: () => isRunning.value }
  ])
);

const instanceOperations = computed(() =>
  arrayFilter([
    { title: t("重啟"), icon: RedoOutlined, noConfirm: false, type: "default", class: "", click: async () => { try { await restartInstance().execute({ params: { uuid: instanceId || "", daemonId: daemonId || "" } }); } catch (error: any) { reportErrorMsg(error); } }, props: {}, condition: () => isRunning.value },
    { title: t("強制停止"), icon: CloseOutlined, noConfirm: false, type: "danger", class: "force-kill-btn", click: async () => { try { await killInstance().execute({ params: { uuid: instanceId || "", daemonId: daemonId || "" } }); } catch (error: any) { reportErrorMsg(error); } }, props: { type: "primary", danger: true }, condition: () => !isStopped.value },
    { title: t("更新"), type: "default", icon: CloudDownloadOutlined, noConfirm: true, class: "", click: async () => { try { clearTerminal(); await updateInstance().execute({ params: { uuid: instanceId || "", daemonId: daemonId || "", task_name: "update" }, data: { time: new Date().getTime() } }); } catch (error: any) { reportErrorMsg(error); } }, props: {}, condition: () => isStopped.value && updateCmd.value },
    { title: t("TXT_CODE_b19ed1dd"), icon: InteractionOutlined, noConfirm: true, class: "", click: async () => { try { clearTerminal(); await openMarketDialog(daemonId ?? "", instanceId ?? "", { autoInstall: true, onlyDockerTemplate: isDockerMode.value }); } catch (error: any) {} }, props: {}, condition: () => isStopped.value && (state.settings.allowUsePreset || isAdmin.value) && !isGlobalTerminal.value }
  ])
);

const getInstanceName = computed(() => instanceInfo.value?.config.nickname === GLOBAL_INSTANCE_NAME ? t("全局終端") : instanceInfo.value?.config.nickname);
const useByteUnit = useLocalStorage("useByteUnit", true);
const prettyBytesConfig: PrettyOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2, binary: true };

const formatMemoryUsage = (usage?: number, limit?: number) => {
  const fUsage = prettyBytes(usage ?? 0, prettyBytesConfig);
  const fLimit = prettyBytes(limit ?? 0, prettyBytesConfig);
  return limit ? `${fUsage} / ${fLimit}` : fUsage;
};

const formatNetworkSpeed = (bytes?: number) =>
  useByteUnit.value
    ? prettyBytes(bytes ?? 0, { ...prettyBytesConfig, binary: false }) + "/s"
    : prettyBytes((bytes ?? 0) * 8, { ...prettyBytesConfig, bits: true, binary: false }).replace(/bit$/, "b") + "ps";

const terminalTopTags = computed<TagInfo[]>(() => {
  const info = instanceInfo.value?.info;
  if (!info || isStopped.value) return [];
  const { cpuUsage, memoryUsage, memoryLimit, memoryUsagePercent, rxBytes, txBytes } = info;
  const safeCpu = cpuUsage ?? 0;
  const safeMemPercent = memoryUsagePercent ?? 0;

  return arrayFilter<TagInfo>([
    { label: t("CPU"), value: `${parseInt(String(safeCpu))}%`, color: safeCpu > 80 ? 'error' : 'default', icon: BlockOutlined, condition: () => cpuUsage != null },
    { label: t("內存"), value: formatMemoryUsage(memoryUsage, memoryLimit), color: safeMemPercent > 90 ? 'error' : 'default', icon: DashboardOutlined, condition: () => memoryUsage != null },
    { label: t("網絡"), value: `↓${formatNetworkSpeed(rxBytes)} · ↑${formatNetworkSpeed(txBytes)}`, icon: ApartmentOutlined, condition: () => rxBytes != null || txBytes != null, onClick: () => { useByteUnit.value = !useByteUnit.value; } }
  ]);
});
</script>

<template>
  <CardPanel class="containerWrapper console-wrapper" style="height: 100%">
    <template #title>
      <CloudServerOutlined />
      <span class="ml-8"> {{ getInstanceName }} </span>
      <span v-if="!isPhone" class="ml-8">
        <a-tag v-if="isRunning" color="green"><CheckCircleOutlined /> {{ instanceStatusText }}</a-tag>
        <a-tag v-else-if="isBuys" color="red"><LoadingOutlined /> {{ instanceStatusText }}</a-tag>
        <a-tag v-else><InfoCircleOutlined /> {{ instanceStatusText }}</a-tag>
        <a-tag v-if="instanceTypeText" color="purple"> {{ instanceTypeText }} </a-tag>
      </span>
    </template>

    <template #operator>
      <a-radio-group v-model:value="activeTab" size="small" class="mr-12" @change="handleTabChange">
        <a-radio-button value="default">{{ t("控制台") }}</a-radio-button>
        <a-radio-button value="warn" class="warn-tab">WARN</a-radio-button>
        <a-radio-button value="error" class="error-tab">ERROR</a-radio-button>
      </a-radio-group>

      <span v-for="item in quickOperations" :key="item.title" class="mr-2">
        <IconBtn :icon="item.icon" :title="item.title" @click="item.click" />
      </span>
      <a-dropdown>
        <template #overlay>
          <a-menu>
            <a-menu-item v-for="item in instanceOperations" :key="item.title" @click="item.click">
              <component :is="item.icon" /><span>&nbsp;{{ item.title }}</span>
            </a-menu-item>
          </a-menu>
        </template>
        <IconBtn :icon="DownOutlined" :title="t('更多操作')" />
      </a-dropdown>
    </template>

    <template #body>
      <div class="terminal-wrapper">
        <div class="terminal-container">
          <TerminalCore
            ref="terminalCoreRef"
            v-if="instanceId && daemonId"
            :use-terminal-hook="terminalHook"
            :instance-id="instanceId"
            :daemon-id="daemonId"
            :height="card.height"
          />
        </div>
        <div class="terminal-tags-overlay">
          <TerminalTags :tags="terminalTopTags" />
        </div>
      </div>
    </template>
  </CardPanel>
</template>

<style lang="scss" scoped>
.console-wrapper {
  position: relative;
  
  .terminal-wrapper {
    border: 1px solid var(--card-border-color);
    position: relative;
    background-color: #1e1e1e;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: 100%;

    .terminal-container {
      height: 100%;
      flex: 1;
    }

    /* 資源監控貼底，保留 3px 空間 */
    .terminal-tags-overlay {
      padding: 0 8px 3px 8px; 
      background: #1e1e1e;
    }
  }
}

/* 修正 WARN/ERROR 顯示視圖，確保其在終端容器內撐滿 */
:deep(.terminal-log-view) {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: #1e1e1e;
  overflow-y: auto;
  padding: 12px;
  z-index: 10;
  font-family: monospace;
  overscroll-behavior: auto;
}

.warn-tab.ant-radio-button-wrapper-checked { border-top: 2px solid #faad14 !important; color: #faad14 !important; }
.error-tab.ant-radio-button-wrapper-checked { border-top: 2px solid #ff4d4f !important; color: #ff4d4f !important; }

.force-kill-btn { color: #ff4d4f !important; }
.align-center { display: flex; align-items: center; }
</style>
