<script setup lang="ts">
import { ref } from "vue";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance"; // 回歸標準接口
import { reportErrorMsg } from "@/tools/validator";
import { Modal, message } from "ant-design-vue";

const props = defineProps<{ instanceId?: string; daemonId?: string }>();
const { isVisible, openDialog: open, cancel, submit } = useDialog<any>(props as any);

const selectedJavaVersion = ref<string>("17");
const javaVersions = [
  { label: "Java 8", value: "8", shell: "./start_8_mc.sh" },
  { label: "Java 17", value: "17", shell: "./start_17_mc.sh" },
  { label: "Java 21", value: "21", shell: "./start_21_mc.sh" },
];

const handleConfirm = async () => {
  const versionObj = javaVersions.find(v => v.value === selectedJavaVersion.value);
  if (!props.instanceId || !props.daemonId) return;

  Modal.confirm({
    title: t("確認變更 Java 版本"),
    content: t("這將直接更新實例的啟動指令。"),
    async onOk() {
      try {
        await updateInstanceConfig().execute({
          params: {
            daemonId: props.daemonId,
            uuid: props.instanceId
          },
          data: {
            // 直接傳送啟動指令
            startCommand: versionObj?.shell
          }
        });
        
        message.success(t("配置已更新！"));
        await submit(true);
      } catch (err: any) {
        return reportErrorMsg(err.message);
      }
    }
  });
};

defineExpose({ openDialog: async () => await open() });
</script>
