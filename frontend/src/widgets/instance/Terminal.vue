<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import CardPanel from "@/components/CardPanel.vue";
import { openMarketDialog, openRenewalDialog } from "@/components/fc";
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
  MoneyCollectOutlined,
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
      if (typeof res === "string") {
        rawText = res;
      } else if (res && typeof res === "object") {
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
    { title: t("更新"), type: "default", icon: CloudDownloadOutlined, noConfirm: true, class: "", click: async () => { try { clearTerminal(); await updateInstance().execute({ params: { uuid: instanceId || "", daemonId: daemonId || "", task_name: "update" }, data: { time: new Date().getTime() } }); } catch (error: any) { reportErrorMsg(error); } }, props: {}, condition: () => isStopped.value && updateCmd.value }
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
  
  // 修正 TS18048: possibly 'undefined'
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
  <div v-if="innerTerminalType" class="inner-terminal-wrapper">
    <div class="mb-24">
      <BetweenMenus>
        <template #left>
          <div class="align-center">
            <a-typography-title class="mb-0 mr-12" :level="4">
              <CloudServerOutlined />
              <span class="ml-6"> {{ getInstanceName }} </span>
            </a-typography-title>
            <a-typography-paragraph v-if="!isPhone" class="mb-0 ml-4">
              <a-tag v-if="isRunning" color="green"><CheckCircleOutlined /> {{ instanceStatusText }}</a-tag>
              <a-tag v-else-if="isBuys" color="red"><LoadingOutlined /> {{ instanceStatusText }}</a-tag>
              <a-tag v-else-if="instanceStatusText"><InfoCircleOutlined /> {{ instanceStatusText }}</a-tag>
              <a-tag v-if="instanceTypeText" color="purple"> {{ instanceTypeText }} </a-tag>
            </a-typography-paragraph>
          </div>
        </template>
        <template #right>
          <div v-if="!isPhone">
            <template v-for="item in [...quickOperations, ...instanceOperations]" :key="item.title">
              <a-button v-if="item.noConfirm" class="ml-8" :class="item.class" v-bind="item.props" :disabled="isOpenInstanceLoading" @click="item.click">
                <component :is="item.icon" /> {{ item.title }}
              </a-button>
              <a-popconfirm v-else :key="item.title" :title="t('確定執行此操作嗎？')" @confirm="item.click">
                <a-button class="ml-8" :class="item.class" v-bind="item.props">
                  <component :is="item.icon" /> {{ item.title }}
                </a-button>
              </a-popconfirm>
            </template>
          </div>
        </template>
      </BetweenMenus>
    </div>

    <div class="mb-12">
      <TerminalTags :tags="terminalTopTags" />
    </div>

    <div class="tab-header-flex">
      <div class="tab-controls">
        <a-radio-group v-model:value="activeTab" size="small" @change="handleTabChange">
          <a-radio-button value="default"><DashboardOutlined /> {{ t("控制台") }}</a-radio-button>
          <a-radio-button value="warn" class="warn-tab">WARN</a-radio-button>
          <a-radio-button value="error" class="error-tab">ERROR</a-radio-button>
        </a-radio-group>
      </div>
    </div>

    <div class="console-container">
      <TerminalCore
        ref="terminalCoreRef"
        v-if="instanceId && daemonId"
        :use-terminal-hook="terminalHook"
        :instance-id="instanceId"
        :daemon-id="daemonId"
        height="500px"
      />
    </div>
  </div>

  <CardPanel v-else class="containerWrapper" style="height: 100%">
    </CardPanel>
</template>

<style lang="scss" scoped>
.inner-terminal-wrapper {
  display: flex;
  flex-direction: column;
}

.tab-header-flex {
  display: flex;
  justify-content: flex-start;
  align-items: flex-end;
}

.tab-controls {
  z-index: 2;
  :deep(.ant-radio-group) {
    display: flex;
    .ant-radio-button-wrapper {
      border-bottom: none !important;
      border-radius: 6px 6px 0 0 !important;
      background: #1e1e1e;
      color: #8c8c8c;
      border-color: var(--card-border-color);
      height: 32px;
      line-height: 30px;
      &.ant-radio-button-wrapper-checked {
        background: #262626;
        color: #ffffff;
      }
    }
    .warn-tab.ant-radio-button-wrapper-checked { border-top: 2px solid #faad14 !important; color: #faad14 !important; }
    .error-tab.ant-radio-button-wrapper-checked { border-top: 2px solid #ff4d4f !important; color: #ff4d4f !important; }
  }
}

.console-container {
  position: relative;
  width: 100%;
  height: 500px;
  margin-top: -1px;
  background: #000;
  border: 1px solid var(--card-border-color);
  border-radius: 0 0 8px 8px;
  overflow: hidden;

  :deep(.terminal-core-container) {
    height: 100% !important;
  }

  :deep(.terminal-log-view) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #1e1e1e;
    overflow-y: auto;
    padding: 12px;
    font-family: "Cascadia Code", Consolas, monospace;
    white-space: pre-wrap;
    z-index: 10;
    color: #d4d4d4;
    overscroll-behavior: auto;
  }
}

:deep(.force-kill-btn) {
  background-color: #ff4d4f !important;
  border-color: #ff4d4f !important;
  color: white !important;
  &:hover { background-color: #ff7875 !important; }
}

.align-center { display: flex; align-items: center; }
</style>
