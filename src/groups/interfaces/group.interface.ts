export interface Grupo {
  id: string;
  nombre: string;
  descripcion: string | null;
  creador_id: string;
  creado_en: string;
}

export interface GrupoWithMembers extends Grupo {
  miembros: GrupoMiembro[];
  permisos?: GrupoPermiso[];
  permisos_por_usuario?: Record<string, GrupoPermiso[]>;
}

export interface GrupoMiembro {
  usuario_id: string;
  nombre_completo: string;
  email: string;
  fecha_unido: string;
}

export interface GrupoPermiso {
  permiso_id: string;
  nombre: string;
  descripcion: string;
}
