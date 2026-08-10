export interface K8sResourceInfo {
    apiVersion: string;
    kind: string;
    name: string;
    namespace: string;
}
export declare function parseK8sYaml(content: string): K8sResourceInfo | undefined;
export declare function isKnownK8sKind(kind: string): boolean;
