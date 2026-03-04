<script setup lang="ts">
import { ref } from "vue";
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { reinstallInstance } from "@/services/apis/instance"; 
import { reportErrorMsg } from "@/tools/validator";
import { Modal, message } from "ant-design-vue";

interface Props extends OpenMarketDialogProps {
  instanceId?: string;
  daemonId?: string;
  destroyComponent?: () => void;
  emitResult?: (res: any) => void;
}

const props = defineProps<Props>();
const { isVisible, openDialog: open, cancel, submit } = useDialog<any>(props as any);

const selectedJavaVersion = ref<string>("17");
const javaVersions = [
  { label: "Java 6", value: "6", shell: "./start_6_mc.sh" },
  { label: "Java 8", value: "8", shell: "./start_8_mc.sh" },
  { label: "Java 17", value: "17", shell: "./start_17_mc.sh" },
  { label: "Java 21", value: "21", shell: "./start_21_mc.sh" },
];

const handleConfirm = async () => {
  const versionObj = javaVersions.find(v => v.value === selectedJavaVersion.value);
  const targetShell = versionObj?.shell || "./start.sh";

  if (!props.instanceId || !props.daemonId) return;

  Modal.confirm({
    title: t("確認切換 Java 版本"),
    content: t("系統將透過模板安裝接口更新啟動指令（不影響檔案）。"),
    async onOk() {
      try {
        // 使用 as any 強制跳過前端類型的嚴格檢查
        // 這樣可以把 setupInfo 成功發送到後端
        await (reinstallInstance().execute as any)({
          params: {
            daemonId: props.daemonId || "",
            uuid: props.instanceId || ""
          },
          data: {
            // 使用你提供的合法模板標題
            title: "Cobblemon Official Modpack", 
            description: "Quick update via java-selector",
            targetUrl: "", 
            // 這裡是重點：Daemon 會讀取 setupInfo 裡的配置
            setupInfo: {
              type: "minecraft/java",
              startCommand: targetShell,
              stopCommand: "stop",
              ie: "utf-8",
              oe: "utf-8"
            }
          }
        });
        
        message.success(t("Java 版本已切換，重啟實例後生效"));
        await submit(true);
      } catch (err: any) {
        return reportErrorMsg(err.message);
      }
    }
  });
};

defineExpose({ openDialog: async () => await open() });
</script>

<template>
  <a-modal v-model:open="isVisible" centered :title="t('Java 版本切換')" :footer="null" width="400px">
    <div class="java-selector">
      <div class="desc">{{ t('選擇欲切換的執行環境：') }}</div>
      <a-select v-model:value="selectedJavaVersion" style="width: 100%; margin: 15px 0;">
        <a-select-option v-for="opt in javaVersions" :key="opt.value" :value="opt.value">
          {{ opt.label }} ({{ opt.shell }})
        </a-select-option>
      </a-select>
      <div class="btns">
        <a-button @click="cancel">{{ t('取消') }}</a-button>
        <a-button type="primary" @click="handleConfirm">{{ t('執行切換') }}</a-button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.java-selector { padding: 10px; }
.desc { color: #888; font-size: 13px; }
.btns { margin-top: 20px; text-align: right; }
.btns button { margin-left: 8px; }
</style>
