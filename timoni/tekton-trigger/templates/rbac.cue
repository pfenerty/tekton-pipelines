package templates

import (
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
)

#ServiceAccount: corev1.#ServiceAccount & {
	#config:    #Config
	apiVersion: "v1"
	kind:       "ServiceAccount"
	metadata:   #config.metadata
}

#RoleBinding: rbacv1.#RoleBinding & {
	#config:    #Config
	apiVersion: "rbac.authorization.k8s.io/v1"
	kind:       "RoleBinding"
	metadata:   #config.metadata
	roleRef: {
		apiGroup: "rbac.authorization.k8s.io"
		kind:     "ClusterRole"
		name:     "tekton-triggers-eventlistener-roles"
	}
	subjects: [{
		kind: #ServiceAccount.kind
		name: #config.metadata.name
	}]
}

#ClusterRoleBinding: rbacv1.#ClusterRoleBinding & {
	#config:    #Config
	apiVersion: "rbac.authorization.k8s.io/v1"
	kind:       "ClusterRoleBinding"
	metadata: {
		labels: #config.metadata.labels
		name:   #config.metadata.name
	}
	roleRef: {
		apiGroup: "rbac.authorization.k8s.io"
		kind:     "ClusterRole"
		name:     "tekton-triggers-eventlistener-clusterroles"
	}
	subjects: [{
		kind:      #ServiceAccount.kind
		name:      #config.metadata.name
		namespace: #config.metadata.namespace
	}]
}
