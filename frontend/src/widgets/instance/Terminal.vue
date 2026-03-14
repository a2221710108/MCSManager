<script setup lang="ts">
import { ref, computed } from "vue";
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

// --- 智能分頁日誌過濾邏輯 ---
const terminalCoreRef = ref();
const activeTab = ref("default");
const { execute: fetchFile } = fileContent();

const handleTabChange = async () => {
  if (activeTab.value === "default") {
    terminalCoreRef.value?.showDefaultView();
  } else {
    terminalCoreRef.value?.showLogView("", true);
    try {
      const res = await fetchFile({
        params: { daemonId: daemonId ?? "", uuid: instanceId ?? "" },
        data: { target: "logs/latest.log" }
      });

      const rawText = typeof res === "string" ? res : "";
      const lines = rawText.split("\n");
      const targetLevel = activeTab.value.toUpperCase(); // "WARN" 或 "ERROR"
      
      const resultLines: string[] = [];
      let isCapturing = false;

      for (const line of lines) {
        // 匹配標題行，例如 [09:11:28] [Server thread/WARN]:
        const isNewLogEntry = line.startsWith("[") && line.includes("]");
        
        if (isNewLogEntry) {
          if (line.includes(`/${targetLevel}]`)) {
            isCapturing = true;
            resultLines.push(line);
          } else {
            isCapturing = false;
          }
        } else if (isCapturing && line.trim() !== "") {
          // 捕獲緊跟在標題行後的堆疊信息（直到下一個時間戳出現）
          resultLines.push(line);
        }
      }
      
      terminalCoreRef.value?.showLogView(
        resultLines.length > 0 ? resultLines.join("\n") : t("未在最近日誌中發現相關信息"), 
        false
      );
    } catch (err: any) {
      reportErrorMsg(err.message);
      terminalCoreRef.value?.showLogView(t("無法讀取日誌文件，請檢查文件是否存在。"), false);
    }
  }
};

// --- 操作按鈕與權限邏輯 ---
const { execute: requestOpenInstance, isLoading: isOpenInstanceLoading } = openInstance();

const toOpenInstance = async () => {
  clearTerminal();
  try {
    if (instanceInfo.value?.config?.type?.startsWith("minecraft/java")) {
      const flag = await verifyEULA(instanceId ?? "", daemonId ?? "");
      if (!flag) return;
      await sleep(1000);
    }
    await requestOpenInstance({
      params: { uuid: instanceId ?? "", daemonId: daemonId ?? "" }
    });
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const updateCmd = computed(() => (instanceInfo.value?.config.updateCommand ? true : false));
const instanceStatusText = computed(() => INSTANCE_STATUS[instanceInfo.value?.status ?? -1]);

const quickOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_57245e94"),
      icon: PlayCircleOutlined,
      type: "default",
      class: "button-color-success",
      click: toOpenInstance,
      condition: () => isStopped.value
    },
    {
      title: t("TXT_CODE_b1dedda3"),
      icon: PauseCircleOutlined,
      type: "default",
      click: async () => {
        try {
          await stopInstance().execute({
            params: { uuid: instanceId || "", daemonId: daemonId || "" }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      props: { danger: true },
      condition: () => isRunning.value
    }
  ])
);

const instanceOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_47dcfa5"),
      icon: RedoOutlined,
      type: "default",
      noConfirm: false, // 補上這個屬性
      click: async () => {
        try {
          await restartInstance().execute({
            params: { uuid: instanceId || "", daemonId: daemonId || "" }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => isRunning.value
    },
    {
      title: t("TXT_CODE_7b67813a"),
      icon: CloseOutlined,
      type: "danger",
      class: "color-warning",
      noConfirm: false, // 補上這個屬性
      click: async () => {
        try {
          await killInstance().execute({
            params: { uuid: instanceId || "", daemonId: daemonId || "" }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => !isStopped.value
    },
    {
      title: t("TXT_CODE_40ca4f2"),
      type: "default",
      icon: CloudDownloadOutlined,
      noConfirm: true, // 更新操作通常不需要二次確認
      click: async () => {
        try {
          clearTerminal();
          await updateInstance().execute({
            params: { uuid: instanceId || "", daemonId: daemonId || "", task_name: "update" },
            data: { time: new Date().getTime() }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => isStopped.value && updateCmd.value
    },
    {
      title: t("TXT_CODE_b19ed1dd"),
      icon: InteractionOutlined,
      noConfirm: true, // 打開彈窗不需要二次確認
      click: async () => {
        try {
          clearTerminal();
          await openMarketDialog(daemonId ?? "", instanceId ?? "", {
            autoInstall: true,
            onlyDockerTemplate: isDockerMode.value
          });
        } catch (error: any) {}
      },
      condition: () => isStopped.value && (state.settings.allowUsePreset || isAdmin.value) && !isGlobalTerminal.value
    }
  ])
);

const getInstanceName = computed(() => {
  return instanceInfo.value?.config.nickname === GLOBAL_INSTANCE_NAME 
    ? t("TXT_CODE_5bdaf23d") 
    : instanceInfo.value?.config.nickname;
});

// --- 資源占用顯示格式化 ---
const useByteUnit = useLocalStorage("useByteUnit", true);
const prettyBytesConfig: PrettyOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2, binary: true };

const getUsageColor = (percentage?: number) => {
  percentage = Number(percentage);
  if (percentage > 600) return "error";
  if (percentage > 200) return "warning";
  return "default";
};

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

  return arrayFilter<TagInfo>([
    { label: t("TXT_CODE_b862a158"), value: `${parseInt(String(cpuUsage))}%`, color: getUsageColor(cpuUsage), icon: BlockOutlined, condition: () => cpuUsage != null },
    { label: t("TXT_CODE_593ee330"), value: formatMemoryUsage(memoryUsage, memoryLimit), color: getUsageColor(memoryUsagePercent), icon: DashboardOutlined, condition: () => memoryUsage != null },
    { label: t("TXT_CODE_50daec4"), value: `↓${formatNetworkSpeed(rxBytes)} · ↑${formatNetworkSpeed(txBytes)}`, icon: ApartmentOutlined, condition: () => rxBytes != null || txBytes != null, onClick: () => { useByteUnit.value = !useByteUnit.value; } }
  ]);
});
</script>

<template>
  <div v-if="innerTerminalType">
    <div class="mb-24">
      <BetweenMenus>
        <template #left>
          <div class="align-center">
            <a-typography-title class="mb-0 mr-12" :level="4">
              <CloudServerOutlined />
              <span class="ml-6"> {{ getInstanceName }} </span>
            </a-typography-title>
            <a-typography-paragraph v-if="!isPhone" class="mb-0 ml-4">
              <span class="ml-6">
                <a-tag v-if="isRunning" color="green"><CheckCircleOutlined /> {{ instanceStatusText }}</a-tag>
                <a-tag v-else-if="isBuys" color="red"><LoadingOutlined /> {{ instanceStatusText }}</a-tag>
                <a-tag v-else-if="instanceStatusText"><InfoCircleOutlined /> {{ instanceStatusText }}</a-tag>
              </span>
              <a-tag v-if="instanceTypeText" color="purple"> {{ instanceTypeText }} </a-tag>
            </a-typography-paragraph>
          </div>
        </template>
        <template #right>
          <div v-if="!isPhone">
            <template v-for="item in [...quickOperations, ...instanceOperations]" :key="item.title">
              <a-button v-if="item.noConfirm || item.type === 'default'" class="ml-8" :class="item.class" :danger="item.type === 'danger'" :disabled="isOpenInstanceLoading" @click="item.click">
                <component :is="item.icon" /> {{ item.title }}
              </a-button>
              <a-popconfirm v-else :key="item.title" :title="t('TXT_CODE_276756b2')" @confirm="item.click">
                <a-button class="ml-8" :danger="item.type === 'danger'" :class="item.class">
                  <component :is="item.icon" /> {{ item.title }}
                </a-button>
              </a-popconfirm>
            </template>
          </div>
        </template>
      </BetweenMenus>
    </div>

    <div class="mb-0 flex-between">
      <div class="tab-controls">
        <a-radio-group v-model:value="activeTab" size="small" @change="handleTabChange">
          <a-radio-button value="default"><DashboardOutlined /> {{ t("控制台") }}</a-radio-button>
          <a-radio-button value="warn" class="warn-tab">WARN</a-radio-button>
          <a-radio-button value="error" class="error-tab">ERROR</a-radio-button>
        </a-radio-group>
      </div>
      <div class="mb-2">
        <TerminalTags :tags="terminalTopTags" />
      </div>
    </div>

    <div class="console-section">
      <TerminalCore
        ref="terminalCoreRef"
        v-if="instanceId && daemonId"
        :use-terminal-hook="terminalHook"
        :instance-id="instanceId"
        :daemon-id="daemonId"
        :height="card.height"
      />
    </div>
  </div>

  <CardPanel v-else class="containerWrapper" style="height: 100%">
    </CardPanel>
</template>

<style lang="scss" scoped>
.flex-between { 
  display: flex; 
  justify-content: space-between; 
  align-items: flex-end; // 改為底端對齊，讓分頁按鈕貼地
  width: 100%;
}

.tab-controls {
  z-index: 2;
  :deep(.ant-radio-group) {
    display: flex;
    .ant-radio-button-wrapper {
      border-bottom: none !important; // 移除底邊，與下方控制台融合
      border-radius: 6px 6px 0 0 !important;
      background: #1e1e1e;
      color: #8c8c8c;
      border-color: var(--card-border-color);
      height: 32px;
      line-height: 30px;
      
      &.ant-radio-button-wrapper-checked {
        background: #262626;
        color: #ffffff;
        &::before { background-color: transparent !important; }
      }

      &:hover { color: #fff; }
    }

    .warn-tab.ant-radio-button-wrapper-checked {
       border-top: 2px solid #faad14 !important;
       color: #faad14 !important;
    }
    .error-tab.ant-radio-button-wrapper-checked {
       border-top: 2px solid #ff4d4f !important;
       color: #ff4d4f !important;
    }
  }
}

.console-section { 
  position: relative; 
  width: 100%;
  margin-top: -1px; // 核心：向上移動 1px 覆蓋邊框達成貼合
  z-index: 1;
  margin-bottom: 20px;
}

.align-center { display: flex; align-items: center; }
</style>
