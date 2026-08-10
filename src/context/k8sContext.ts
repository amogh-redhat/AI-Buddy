export interface K8sResourceInfo {
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
}

export function parseK8sYaml(content: string): K8sResourceInfo | undefined {
  const lines = content.split('\n');
  const info: Partial<K8sResourceInfo> = {};

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

export function isKnownK8sKind(kind: string): boolean {
  return KNOWN_K8S_KINDS.has(kind);
}
