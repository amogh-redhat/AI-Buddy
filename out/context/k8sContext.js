"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseK8sYaml = parseK8sYaml;
exports.isKnownK8sKind = isKnownK8sKind;
function parseK8sYaml(content) {
    const lines = content.split('\n');
    const info = {};
    for (const line of lines) {
        const trimmed = line.trim();
        const apiVersionMatch = trimmed.match(/^apiVersion:\s*(.+)/);
        if (apiVersionMatch) {
            info.apiVersion = apiVersionMatch[1].trim();
        }
        const kindMatch = trimmed.match(/^kind:\s*(.+)/);
        if (kindMatch) {
            info.kind = kindMatch[1].trim();
        }
        const nameMatch = trimmed.match(/^\s*name:\s*(.+)/);
        if (nameMatch && !info.name) {
            info.name = nameMatch[1].trim();
        }
        const nsMatch = trimmed.match(/^\s*namespace:\s*(.+)/);
        if (nsMatch) {
            info.namespace = nsMatch[1].trim();
        }
    }
    if (info.kind && info.apiVersion) {
        return {
            apiVersion: info.apiVersion,
            kind: info.kind,
            name: info.name || '',
            namespace: info.namespace || '',
        };
    }
    return undefined;
}
const KNOWN_K8S_KINDS = new Set([
    'Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet',
    'Service', 'Ingress', 'Route',
    'ConfigMap', 'Secret',
    'PersistentVolumeClaim', 'PersistentVolume', 'StorageClass',
    'Namespace', 'Node',
    'ServiceAccount', 'Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding',
    'NetworkPolicy', 'HorizontalPodAutoscaler',
    'Job', 'CronJob',
    'CustomResourceDefinition',
    // OpenShift-specific
    'DeploymentConfig', 'BuildConfig', 'ImageStream', 'Project',
    // HyperShift
    'HostedCluster', 'HostedControlPlane', 'NodePool',
]);
function isKnownK8sKind(kind) {
    return KNOWN_K8S_KINDS.has(kind);
}
//# sourceMappingURL=k8sContext.js.map