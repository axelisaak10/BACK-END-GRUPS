import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CreateGroupDto,
  UpdateGroupDto,
  AddMemberDto,
  AssignPermissionsDto,
} from './dto/group.dto';
import { Grupo, GrupoWithMembers } from './interfaces/group.interface';

@Injectable()
export class GroupsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * =================================================================
   *helper: Verifica acceso a un grupo según lógica de 3 capas
   * =================================================================
   */
  private async checkGroupAccess(
    groupId: string,
    userId: string,
    userPermissions: string[],
    requiredPermission?: string,
  ): Promise<{ hasAccess: boolean; isCreator: boolean }> {
    // Capa 1: Permisos Globales (Bypass)
    const isGlobalAdmin =
      userPermissions.includes('superadmin') ||
      userPermissions.includes('group:manage');

    if (isGlobalAdmin) {
      return { hasAccess: true, isCreator: false };
    }

    // Obtener datos del grupo
    const { data: grupo } = await this.supabaseService.client
      .from('grupos')
      .select('creador_id')
      .eq('id', groupId)
      .single();

    if (!grupo) {
      throw new NotFoundException('Grupo no encontrado');
    }

    // Capa 2: Dueño del Grupo (Autoridad Absoluta Local)
    const isCreator = grupo.creador_id === userId;
    if (isCreator) {
      return { hasAccess: true, isCreator: true };
    }

    // Si solo requiere acceso básico (ser miembro), verificar membresía
    if (!requiredPermission) {
      const { data: miembro } = await this.supabaseService.client
        .from('grupo_miembros')
        .select('usuario_id')
        .eq('grupo_id', groupId)
        .eq('usuario_id', userId)
        .single();

      return { hasAccess: !!miembro, isCreator: false };
    }

    // Capa 3: Permisos Específicos por Grupo
    // Buscar el UUID del permiso específico O el permiso de administración del grupo
    const permisosBuscados = requiredPermission ? [requiredPermission, 'group:manage'] : ['group:manage'];
    
    const { data: permisosPermitidos } = await this.supabaseService.client
      .from('permisos')
      .select('id, nombre')
      .in('nombre', permisosBuscados);

    if (permisosPermitidos && permisosPermitidos.length > 0) {
      const permisoIds = permisosPermitidos.map(p => p.id);
      
      const { data: grupoPermiso } = await this.supabaseService.client
        .from('grupo_usuario_permisos')
        .select('permiso_id')
        .eq('grupo_id', groupId)
        .eq('usuario_id', userId)
        .in('permiso_id', permisoIds)
        .limit(1);

      if (grupoPermiso && grupoPermiso.length > 0) {
        return { hasAccess: true, isCreator: false };
      }
    }

    return { hasAccess: false, isCreator: false };
  }

  /**
   * =================================================================
   *helper: Verifica si el usuario tiene permiso específico en el grupo
   * =================================================================
   */
  private async hasGroupPermission(
    groupId: string,
    userId: string,
    permissionName: string,
  ): Promise<boolean> {
    // Buscar el UUID del permiso por nombre
    const { data: permisoObj } = await this.supabaseService.client
      .from('permisos')
      .select('id')
      .eq('nombre', permissionName)
      .single();

    if (!permisoObj) return false;

    const { data: grupoPermiso } = await this.supabaseService.client
      .from('grupo_usuario_permisos')
      .select('permiso_id')
      .eq('grupo_id', groupId)
      .eq('usuario_id', userId)
      .eq('permiso_id', permisoObj.id)
      .single();

    return !!grupoPermiso;
  }

  /**
   * =================================================================
   *helper: Verifica si el usuario es miembro del grupo
   * =================================================================
   */
  private async isGroupMember(
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    const { data: miembro } = await this.supabaseService.client
      .from('grupo_miembros')
      .select('usuario_id')
      .eq('grupo_id', groupId)
      .eq('usuario_id', userId)
      .single();

    return !!miembro;
  }

  /**
   * =================================================================
   * POST /grupos - Crear grupo
   * El usuario del JWT se convierte en creador_id Y se agrega automáticamente
   * como miembro del grupo.
   * =================================================================
   */
  async create(creatorId: string, dto: CreateGroupDto): Promise<Grupo> {
    // 1. Crear el grupo
    const { data, error } = await this.supabaseService.client
      .from('grupos')
      .insert({
        nombre: dto.nombre,
        descripcion: dto.descripcion || null,
        creador_id: creatorId,
      })
      .select()
      .single();

    if (error) {
      throw new ForbiddenException(`Error al crear grupo: ${error.message}`);
    }

    // 2. Agregar automáticamente al creador como miembro
    const { error: memberError } = await this.supabaseService.client
      .from('grupo_miembros')
      .insert({
        grupo_id: data.id,
        usuario_id: creatorId,
      });

    if (memberError) {
      console.error('Error al agregar creador como miembro:', memberError);
    }

    // 3. Asignar todos los permisos al creador del grupo
    await this.assignAllPermissionsToCreator(data.id, creatorId);

    return data as Grupo;
  }

  /**
   * =================================================================
   * GET /grupos - Listar grupos
   * Si es admin global: ve todos los grupos
    * Si no: solo ve los grupos donde tiene permiso group:view
    * =================================================================
    */
  async findAll(
    userId: string,
    permissions: string[],
    gruposDelToken?: { id: string; nombre: string; permisos: string[] }[],
  ): Promise<any[]> {
    const globalPerms = permissions || [];
    const isSuperAdmin = globalPerms.includes('superadmin');

    let grupos: any[] = [];

    if (isSuperAdmin) {
      const { data, error } = await this.supabaseService.client
        .from('grupos')
        .select('*')
        .order('creado_en', { ascending: false });

      if (error) {
        throw new ForbiddenException(`Error al obtener grupos: ${error.message}`);
      }

      grupos = data || [];
    } else {
      if (!gruposDelToken || gruposDelToken.length === 0) {
        return [];
      }

      const gruposConPermisoView = gruposDelToken.filter(g => 
        g.permisos && g.permisos.includes('group:view')
      );

      if (gruposConPermisoView.length === 0) {
        return [];
      }

      const grupoIds = gruposConPermisoView.map((g) => g.id);

      const { data: gruposFiltrados } = await this.supabaseService.client
        .from('grupos')
        .select('*')
        .in('id', grupoIds)
        .order('creado_en', { ascending: false });

      grupos = gruposFiltrados || [];
    }

    // Obtener conteo de miembros para cada grupo
    const gruposConMiembros = await Promise.all(
      grupos.map(async (grupo) => {
        // Contar miembros
        const { count } = await this.supabaseService.client
          .from('grupo_miembros')
          .select('*', { count: 'exact', head: true })
          .eq('grupo_id', grupo.id);

        // Verificar si el usuario actual es miembro
        const { data: esMiembro } = await this.supabaseService.client
          .from('grupo_miembros')
          .select('id')
          .eq('grupo_id', grupo.id)
          .eq('usuario_id', userId)
          .limit(1);

        // Obtener permisos locales del usuario para este grupo
        const { data: userGroupPerms } = await this.supabaseService.client
          .from('grupo_usuario_permisos')
          .select('permiso:permisos(nombre)')
          .eq('grupo_id', grupo.id)
          .eq('usuario_id', userId);

        const permisosLocales = userGroupPerms
          ? userGroupPerms.map((p: any) => p.permiso?.nombre).filter(Boolean)
          : [];

        return {
          ...grupo,
          miembros_count: count || 0,
          es_miembro: !!esMiembro && esMiembro.length > 0,
          es_creador: grupo.creador_id === userId,
          permisos_locales: permisosLocales,
        };
      })
    );

    return gruposConMiembros;
  }

  /**
   * =================================================================
   * GET /grupos/:id - Obtener detalles del grupo
   * Requiere: ser miembro, creador, o admin global
   * =================================================================
   */
  async findOne(
    id: string,
    userId: string,
    permissions: string[],
  ): Promise<GrupoWithMembers> {
    // Verificar acceso (ser miembro, creador o admin)
    const access = await this.checkGroupAccess(id, userId, permissions);
    if (!access.hasAccess) {
      throw new ForbiddenException('No tienes acceso a este grupo');
    }

    const { data: grupo, error: groupError } = await this.supabaseService.client
      .from('grupos')
      .select('*')
      .eq('id', id)
      .single();

    if (groupError || !grupo) {
      throw new NotFoundException('Grupo no encontrado');
    }

    // Obtener miembros con datos del usuario
    const { data: miembros } = await this.supabaseService.client
      .from('grupo_miembros')
      .select(
        '*, usuarios!grupo_miembros_usuario_id_fkey(nombre_completo, email)',
      )
      .eq('grupo_id', id);

    // Obtener permisos específicos del grupo
    const { data: permisos } = await this.supabaseService.client
      .from('grupo_usuario_permisos')
      .select('usuario_id, permiso_id, permisos(nombre, descripcion)')
      .eq('grupo_id', id);

    // Formatear miembros
    const formattedMembers = (miembros || []).map((m: any) => ({
      usuario_id: m.usuario_id,
      nombre_completo: m.usuarios?.nombre_completo || 'Unknown',
      email: m.usuarios?.email || '',
      fecha_unido: m.fecha_unido,
    }));

    // Formatear permisos por usuario
    const permisosPorUsuario: Record<string, any[]> = {};
    for (const p of permisos || []) {
      if (!permisosPorUsuario[p.usuario_id]) {
        permisosPorUsuario[p.usuario_id] = [];
      }
      const permisosData = p.permisos as any;
      permisosPorUsuario[p.usuario_id].push({
        permiso_id: p.permiso_id,
        nombre: permisosData?.nombre || '',
        descripcion: permisosData?.descripcion || '',
      });
    }

    return {
      ...(grupo as Grupo),
      miembros: formattedMembers,
      permisos_por_usuario: permisosPorUsuario,
    };
  }

  /**
   * =================================================================
   * PUT /grupos/:id - Actualizar grupo
   * Requiere: admin global, creador, o permiso 'group:edit' en el grupo
   * =================================================================
   */
  async update(
    id: string,
    userId: string,
    permissions: string[],
    dto: UpdateGroupDto,
  ): Promise<Grupo> {
    // Verificar acceso con permiso específico
    const access = await this.checkGroupAccess(
      id,
      userId,
      permissions,
      'group:edit',
    );

    if (!access.hasAccess) {
      throw new ForbiddenException('No tienes permiso para editar este grupo');
    }

    const { data, error } = await this.supabaseService.client
      .from('grupos')
      .update({
        nombre: dto.nombre,
        descripcion: dto.descripcion,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ForbiddenException(`Error al actualizar grupo: ${error.message}`);
    }

    return data as Grupo;
  }

  /**
   * =================================================================
   * DELETE /grupos/:id - Eliminar grupo
   * Requiere: admin global, creador, o permiso 'group:delete' en el grupo
   * =================================================================
   */
  async remove(
    id: string,
    userId: string,
    permissions: string[],
  ): Promise<void> {
    // Verificar acceso con permiso específico
    const access = await this.checkGroupAccess(
      id,
      userId,
      permissions,
      'group:delete',
    );

    if (!access.hasAccess) {
      throw new ForbiddenException('No tienes permiso para eliminar este grupo');
    }

    const { error } = await this.supabaseService.client
      .from('grupos')
      .delete()
      .eq('id', id);

    if (error) {
      throw new ForbiddenException(`Error al eliminar grupo: ${error.message}`);
    }
  }

  /**
   * =================================================================
   * POST /grupos/:id/members - Agregar miembro al grupo
   * Requiere: admin global, creador, o permiso 'group:manage' en el grupo
   * =================================================================
   */
  async addMember(
    id: string,
    userId: string,
    permissions: string[],
    dto: AddMemberDto,
  ): Promise<{ message: string; miembro: { grupo_id: string; usuario_id: string } }> {
    // Verificar acceso
    const access = await this.checkGroupAccess(
      id,
      userId,
      permissions,
      'group:add',
    );

    if (!access.hasAccess) {
      throw new ForbiddenException('No tienes permiso para gestionar miembros');
    }

    // Verificar que el usuario a agregar existe
    const { data: usuarioExistente } = await this.supabaseService.client
      .from('usuarios')
      .select('id, nombre_completo, email')
      .eq('id', dto.usuario_id)
      .single();

    if (!usuarioExistente) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que no sea ya miembro
    const yaEsMiembro = await this.isGroupMember(id, dto.usuario_id);
    if (yaEsMiembro) {
      throw new ForbiddenException('El usuario ya es miembro del grupo');
    }

    const { error } = await this.supabaseService.client
      .from('grupo_miembros')
      .insert({
        grupo_id: id,
        usuario_id: dto.usuario_id,
      });

    if (error) {
      throw new ForbiddenException(`Error al agregar miembro: ${error.message}`);
    }

    return {
      message: `Usuario ${usuarioExistente.nombre_completo} agregado al grupo correctamente`,
      miembro: {
        grupo_id: id,
        usuario_id: dto.usuario_id,
      },
    };
  }

  /**
   * =================================================================
   * DELETE /grupos/:id/members/:userId - Remover miembro
   * Requiere: admin global, creador, o permiso 'group:manage' en el grupo
   * Excepción: un usuario puede removerse a sí mismo
   * =================================================================
   */
  async removeMember(
    id: string,
    memberUserId: string,
    userId: string,
    permissions: string[],
  ): Promise<void> {
    // Verificar acceso (group:manage o ser el creador del grupo)
    const access = await this.checkGroupAccess(
      id,
      userId,
      permissions,
      'group:manage',
    );

    const isSelfRemoval = memberUserId === userId;

    if (!access.hasAccess && !isSelfRemoval) {
      throw new ForbiddenException('No tienes permiso para remover miembros');
    }

    const { error } = await this.supabaseService.client
      .from('grupo_miembros')
      .delete()
      .eq('grupo_id', id)
      .eq('usuario_id', memberUserId);

    if (error) {
      throw new ForbiddenException(`Error al remover miembro: ${error.message}`);
    }
  }

  /**
   * =================================================================
   * POST /grupos/:id/permissions - Asignar permisos a usuario en grupo
   * Requiere: admin global O creador del grupo
   * =================================================================
   */
  async assignPermissions(
    id: string,
    userId: string,
    permissions: string[],
    dto: AssignPermissionsDto,
  ): Promise<void> {
    // Solo admin global o creador del grupo pueden asignar permisos
    const isGlobalAdmin =
      permissions.includes('superadmin') ||
      permissions.includes('group:manage');

    const { data: grupo } = await this.supabaseService.client
      .from('grupos')
      .select('creador_id')
      .eq('id', id)
      .single();

    if (!grupo) {
      throw new NotFoundException('Grupo no encontrado');
    }

    const isCreator = grupo.creador_id === userId;

    if (!isGlobalAdmin && !isCreator) {
      throw new ForbiddenException(
        'No tienes permiso para gestionar permisos del grupo',
      );
    }

    // Verificar que el usuario es miembro del grupo
    const esMiembro = await this.isGroupMember(id, dto.usuario_id);
    if (!esMiembro) {
      throw new ForbiddenException(
        'El usuario debe ser miembro del grupo para recibir permisos',
      );
    }

    // Crear registros de permisos
    const inserts = dto.permisos.map((permisoId) => ({
      grupo_id: id,
      usuario_id: dto.usuario_id,
      permiso_id: permisoId,
    }));

    const { error } = await this.supabaseService.client
      .from('grupo_usuario_permisos')
      .upsert(inserts, { onConflict: 'grupo_id,usuario_id,permiso_id' });

    if (error) {
      throw new ForbiddenException(`Error al asignar permisos: ${error.message}`);
    }
  }

  /**
   * =================================================================
   * GET /grupos/permissions - Listar permisos disponibles
   * =================================================================
   */
  async findAllPermissions(userPermissions: string[]): Promise<any[]> {
    const canView =
      userPermissions.includes('superadmin') ||
      userPermissions.includes('group:view') ||
      userPermissions.includes('group:manage');

    if (!canView) {
      throw new ForbiddenException('No tienes permiso para ver permisos');
    }

    const { data, error } = await this.supabaseService.client
      .from('permisos')
      .select('id, nombre, descripcion')
      .not('nombre', 'eq', 'superadmin')
      .not('nombre', 'like', 'user:%')
      .order('nombre');

    if (error) {
      throw new ForbiddenException(`Error al obtener permisos: ${error.message}`);
    }

    return data || [];
  }

  /**
   * =================================================================
   * GET /grupos/members - Listar todos los miembros de todos los grupos
   * =================================================================
   */
  async findAllMembers(
    userId: string, 
    permissions: string[],
    gruposDelToken?: { id: string; nombre: string; permisos: string[] }[],
  ): Promise<any[]> {
    const globalPerms = permissions || [];
    const isSuperAdmin = globalPerms.includes('superadmin');

    let grupoIdsPermitidos: string[] = [];

    if (isSuperAdmin) {
      const { data: allGroups } = await this.supabaseService.client
        .from('grupos')
        .select('id');
      grupoIdsPermitidos = allGroups?.map(g => g.id) || [];
    } else {
      if (!gruposDelToken || gruposDelToken.length === 0) {
        throw new ForbiddenException('No tienes permiso para ver miembros');
      }

      const gruposConPermisoView = gruposDelToken.filter(g => 
        g.permisos && g.permisos.includes('group:view')
      );

      if (gruposConPermisoView.length === 0) {
        throw new ForbiddenException('No tienes permiso para ver miembros');
      }

      grupoIdsPermitidos = gruposConPermisoView.map(g => g.id);
    }

    const { data, error } = await this.supabaseService.client
      .from('grupo_miembros')
      .select(
        `
        *,
        grupo:grupos(id, nombre),
        usuario:usuarios(id, nombre_completo, email)
      `,
      )
      .in('grupo_id', grupoIdsPermitidos)
      .order('fecha_unido', { ascending: false });

    if (error) {
      throw new ForbiddenException(`Error al obtener miembros: ${error.message}`);
    }

    const formattedMembers = (data || []).map((m: any) => ({
      id: m.id,
      grupoId: m.grupo_id,
      grupoNombre: m.grupo?.nombre || '',
      usuarioId: m.usuario_id,
      usuarioNombre: m.usuario?.nombre_completo || 'Unknown',
      usuarioEmail: m.usuario?.email || '',
      fechaUnido: m.fecha_unido,
    }));

    return formattedMembers;
  }

  /**
   * =================================================================
   * GET /grupos/:id/members - Obtener miembros de un grupo específico
   * =================================================================
   */
  async getGroupMembers(groupId: string, userId: string, permissions: string[]): Promise<any[]> {
    console.log('[DEBUG] getGroupMembers: groupId:', groupId, 'userId:', userId)
    
    const canViewAll = permissions.includes('superadmin') || permissions.includes('group:view')

    if (!canViewAll) {
      throw new ForbiddenException('No tienes permiso para ver miembros')
    }

    const { data, error } = await this.supabaseService.client
      .from('grupo_miembros')
      .select(
        `
        *,
        usuario:usuarios(id, nombre_completo, email)
      `,
      )
      .eq('grupo_id', groupId)
      .order('fecha_unido', { ascending: false })

    console.log('[DEBUG] getGroupMembers: data:', data, 'error:', error)

    if (error) {
      throw new ForbiddenException('Error al obtener miembros: ' + error.message)
    }

    const formattedMembers = (data || []).map((m: any) => ({
      id: m.id,
      grupoId: m.grupo_id,
      usuario_id: m.usuario_id,
      nombre: m.usuario?.nombre_completo || 'Unknown',
      email: m.usuario?.email || '',
      fechaUnido: m.fecha_unido,
    }))

    console.log('[DEBUG] getGroupMembers: formattedMembers:', formattedMembers)

    return formattedMembers
  }

  /**
   * =================================================================
   * Obtener permisos de un miembro específico del grupo
   * =================================================================
   */
  async getMemberPermissions(
    groupId: string,
    userId: string,
    requestUserId: string,
    requestPermissions: string[],
  ): Promise<any[]> {
    // Verificar acceso
    const access = await this.checkGroupAccess(
      groupId,
      requestUserId,
      requestPermissions,
      'group:manage',
    );

    if (!access.hasAccess) {
      throw new ForbiddenException('No tienes permiso para ver permisos de miembros');
    }

    // Obtener los permisos del miembro
    const { data: permisos, error } = await this.supabaseService.client
      .from('grupo_usuario_permisos')
      .select(`
        permiso_id,
        permisos(id, nombre, descripcion)
      `)
      .eq('grupo_id', groupId)
      .eq('usuario_id', userId);

    if (error) {
      throw new ForbiddenException(`Error al obtener permisos: ${error.message}`);
    }

    return (permisos || []).map((p: any) => ({
      id: p.permisos?.id,
      nombre: p.permisos?.nombre,
      descripcion: p.permisos?.descripcion,
    }));
  }

  /**
   * =================================================================
   * Asignar permisos a un miembro del grupo
   * =================================================================
   */
  async assignMemberPermissions(
    groupId: string,
    userId: string,
    requestUserId: string,
    requestPermissions: string[],
    permisos: string[],
  ): Promise<{ message: string; permisosAsignados: string[] }> {
    // Verificar acceso
    const access = await this.checkGroupAccess(
      groupId,
      requestUserId,
      requestPermissions,
      'group:manage',
    );

    if (!access.hasAccess) {
      throw new ForbiddenException('No tienes permiso para asignar permisos a miembros');
    }

    // Verificar que es miembro del grupo
    const esMiembro = await this.isGroupMember(groupId, userId);
    if (!esMiembro) {
      throw new NotFoundException('El usuario no es miembro del grupo');
    }

    // Obtener los UUIDs de los permisos por nombre
    const { data: permisosData } = await this.supabaseService.client
      .from('permisos')
      .select('id, nombre')
      .in('nombre', permisos);

    if (!permisosData || permisosData.length === 0) {
      throw new NotFoundException('Permisos no encontrados');
    }

    // Insertar los permisos en grupo_usuario_permisos
    const permisosAInsertar = permisosData.map((p) => ({
      grupo_id: groupId,
      usuario_id: userId,
      permiso_id: p.id,
    }));

    const { error: insertError } = await this.supabaseService.client
      .from('grupo_usuario_permisos')
      .upsert(permisosAInsertar, {
        onConflict: 'grupo_id,usuario_id,permiso_id',
      });

    if (insertError) {
      throw new ForbiddenException(`Error al asignar permisos: ${insertError.message}`);
    }

    return {
      message: `Permisos asignados correctamente al miembro`,
      permisosAsignados: permisosData.map((p) => p.nombre),
    };
  }

  /**
   * =================================================================
   * Quitar permisos específicos de un miembro del grupo
   * =================================================================
   */
  async removeMemberPermissions(
    groupId: string,
    userId: string,
    requestUserId: string,
    requestPermissions: string[],
    permisos: string[],
  ): Promise<{ message: string; permisosEliminados: string[] }> {
    // Verificar acceso
    const access = await this.checkGroupAccess(
      groupId,
      requestUserId,
      requestPermissions,
      'group:manage',
    );

    if (!access.hasAccess) {
      throw new ForbiddenException('No tienes permiso para quitar permisos de miembros');
    }

    // Obtener los UUIDs de los permisos por nombre
    const { data: permisosData } = await this.supabaseService.client
      .from('permisos')
      .select('id, nombre')
      .in('nombre', permisos);

    if (!permisosData || permisosData.length === 0) {
      throw new NotFoundException('Permisos no encontrados');
    }

    // Eliminar los permisos
    for (const permiso of permisosData) {
      const { error: deleteError } = await this.supabaseService.client
        .from('grupo_usuario_permisos')
        .delete()
        .eq('grupo_id', groupId)
        .eq('usuario_id', userId)
        .eq('permiso_id', permiso.id);

      if (deleteError) {
        throw new ForbiddenException(`Error al quitar permiso ${permiso.nombre}: ${deleteError.message}`);
      }
    }

    return {
      message: `Permisos eliminados correctamente del miembro`,
      permisosEliminados: permisosData.map((p) => p.nombre),
    };
  }

  /**
   * =================================================================
   * Asignar todos los permisos al creador del grupo (utilidad)
   * =================================================================
   */
  async assignAllPermissionsToCreator(groupId: string, creatorId: string): Promise<void> {
    // Lista completa de permisos a asignar
    const ALL_PERMISOS = [
      // Permisos de grupos
      'group:view',
      'group:add',
      'group:edit',
      'group:delete',
      'group:manage',
      // Permisos de tickets
      'ticket:view',
      'ticket:add',
      'ticket:edit',
      'ticket:edit:state',
      'ticket:edit:comment',
      'ticket:delete',
      'ticket:manage',
    ];

    // Obtener los UUIDs de todos los permisos
    const { data: permisosData } = await this.supabaseService.client
      .from('permisos')
      .select('id, nombre')
      .in('nombre', ALL_PERMISOS);

    if (!permisosData || permisosData.length === 0) {
      return; // No hay permisos para asignar
    }

    // Verificar si ya existen permisos para este usuario en este grupo
    const { data: existentes } = await this.supabaseService.client
      .from('grupo_usuario_permisos')
      .select('permiso_id')
      .eq('grupo_id', groupId)
      .eq('usuario_id', creatorId);

    // Si ya tiene permisos, no asignar de nuevo
    if (existentes && existentes.length > 0) {
      return;
    }

    // Insertar todos los permisos
    const permisosAInsertar = permisosData.map((p) => ({
      grupo_id: groupId,
      usuario_id: creatorId,
      permiso_id: p.id,
    }));

    await this.supabaseService.client
      .from('grupo_usuario_permisos')
      .insert(permisosAInsertar);
  }

  /**
   * =================================================================
   * Verificar si un usuario tiene permiso en un grupo (para tickets)
   * =================================================================
   */
  async checkUserPermissionInGroup(
    userId: string,
    groupId: string,
    permissionName: string,
  ): Promise<boolean> {
    // Verificar si es el creador del grupo
    const { data: grupo } = await this.supabaseService.client
      .from('grupos')
      .select('creador_id')
      .eq('id', groupId)
      .single();

    if (grupo?.creador_id === userId) {
      return true; // El creador siempre tiene todos los permisos
    }

    // Verificar en grupo_usuario_permisos
    return this.hasGroupPermission(groupId, userId, permissionName);
  }
}