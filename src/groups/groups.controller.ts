import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import {
  CreateGroupDto,
  UpdateGroupDto,
  AddMemberDto,
  AssignPermissionsDto,
} from './dto/group.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckPermissions } from '../common/decorators/check-permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    permisos_globales: string[];
    grupos: { id: string; nombre: string; permisos: string[] }[];
  };
}

@ApiTags('Groups')
@ApiBearerAuth('JWT-auth')
@Controller('groups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @CheckPermissions('group:add', 'superadmin')
  @ApiOperation({ summary: 'Crear un nuevo grupo' })
  @ApiResponse({ status: 201, description: 'Grupo creado exitosamente' })
  @ApiResponse({ status: 403, description: 'Sin permiso para crear grupo' })
  create(
    @Request() req: RequestWithUser,
    @Body() createGroupDto: CreateGroupDto,
  ) {
    return this.groupsService.create(req.user.sub, createGroupDto);
  }

  @Get()
  @CheckPermissions('group:view', 'superadmin')
  @ApiOperation({ summary: 'Listar todos los grupos' })
  @ApiResponse({ status: 200, description: 'Lista de grupos' })
  @ApiResponse({ status: 403, description: 'Sin permiso para ver grupos' })
  findAll(@Request() req: RequestWithUser) {
    console.log('[GROUPS-CONTROLLER] findAll called:', {
      userId: req.user.sub,
      permisos_globales: req.user.permisos_globales,
      grupos: req.user.grupos,
    });
    return this.groupsService.findAll(req.user.sub, req.user.permisos_globales, req.user.grupos);
  }

  @Get('permissions')
  @CheckPermissions('group:view', 'superadmin', 'group:manage')
  @ApiOperation({ summary: 'Listar permisos disponibles del sistema' })
  @ApiResponse({ status: 200, description: 'Lista de permisos disponibles' })
  findAllPermissions(@Request() req: RequestWithUser) {
    return this.groupsService.findAllPermissions(req.user.permisos_globales);
  }

  @Get('members')
  @CheckPermissions('group:view', 'superadmin')
  @ApiOperation({ summary: 'Listar todos los miembros de todos los grupos' })
  @ApiResponse({ status: 200, description: 'Lista de todos los miembros' })
  @ApiResponse({ status: 403, description: 'Sin permiso para ver miembros' })
  findAllMembers(@Request() req: RequestWithUser) {
    return this.groupsService.findAllMembers(req.user.sub, req.user.permisos_globales, req.user.grupos);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un grupo por ID' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiResponse({ status: 200, description: 'Grupo encontrado' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para ver grupo' })
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.groupsService.findOne(
      id,
      req.user.sub,
      req.user.permisos_globales,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar un grupo' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiResponse({ status: 200, description: 'Grupo actualizado' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para editar grupo' })
  update(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
    @Body() updateGroupDto: UpdateGroupDto,
  ) {
    return this.groupsService.update(
      id,
      req.user.sub,
      req.user.permisos_globales,
      updateGroupDto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un grupo' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiResponse({ status: 200, description: 'Grupo eliminado' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para eliminar grupo' })
  remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.groupsService.remove(
      id,
      req.user.sub,
      req.user.permisos_globales,
    );
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Agregar miembro al grupo' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiResponse({ status: 201, description: 'Miembro agregado' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado' })
  @ApiResponse({
    status: 403,
    description: 'Sin permiso para gestionar miembros',
  })
  addMember(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
    @Body() addMemberDto: AddMemberDto,
  ) {
    return this.groupsService.addMember(
      id,
      req.user.sub,
      req.user.permisos_globales,
      addMemberDto,
    );
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remover miembro del grupo' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiParam({ name: 'userId', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Miembro removido' })
  @ApiResponse({ status: 404, description: 'Grupo o miembro no encontrado' })
  @ApiResponse({
    status: 403,
    description: 'Sin permiso para gestionar miembros',
  })
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.groupsService.removeMember(
      id,
      userId,
      req.user.sub,
      req.user.permisos_globales,
    );
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Obtener miembros de un grupo específico' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiResponse({ status: 200, description: 'Lista de miembros del grupo' })
  @ApiResponse({ status: 403, description: 'Sin permiso para ver miembros' })
  getGroupMembers(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.groupsService.getGroupMembers(
      id,
      req.user.sub,
      req.user.permisos_globales,
    );
  }

  @Post(':id/permissions')
  @ApiOperation({ summary: 'Asignar permisos al grupo' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiResponse({ status: 201, description: 'Permisos asignados' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado' })
  @ApiResponse({
    status: 403,
    description: 'Sin permiso para gestionar permisos',
  })
  assignPermissions(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
    @Body() assignPermissionsDto: AssignPermissionsDto,
  ) {
    return this.groupsService.assignPermissions(
      id,
      req.user.sub,
      req.user.permisos_globales,
      assignPermissionsDto,
    );
  }

  @Get(':id/members/:userId/permissions')
  @ApiOperation({ summary: 'Obtener permisos de un miembro' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiParam({ name: 'userId', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de permisos del miembro' })
  @ApiResponse({ status: 403, description: 'Sin permiso para ver permisos' })
  getMemberPermissions(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.groupsService.getMemberPermissions(
      id,
      userId,
      req.user.sub,
      req.user.permisos_globales,
    );
  }

  @Post(':id/members/:userId/permissions')
  @ApiOperation({ summary: 'Asignar permisos a un miembro' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiParam({ name: 'userId', description: 'UUID del usuario' })
  @ApiResponse({ status: 201, description: 'Permisos asignados' })
  @ApiResponse({ status: 403, description: 'Sin permiso para asignar permisos' })
  assignMemberPermissions(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: RequestWithUser,
    @Body() body: { permisos: string[] },
  ) {
    return this.groupsService.assignMemberPermissions(
      id,
      userId,
      req.user.sub,
      req.user.permisos_globales,
      body.permisos,
    );
  }

  @Delete(':id/members/:userId/permissions')
  @CheckPermissions('group:manage', 'superadmin')
  @ApiOperation({ summary: 'Quitar permisos de un miembro' })
  @ApiParam({ name: 'id', description: 'UUID del grupo' })
  @ApiParam({ name: 'userId', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Permisos eliminados' })
  @ApiResponse({ status: 403, description: 'Sin permiso para quitar permisos' })
  removeMemberPermissions(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: RequestWithUser,
    @Body() body: { permisos: string[] },
  ) {
    return this.groupsService.removeMemberPermissions(
      id,
      userId,
      req.user.sub,
      req.user.permisos_globales,
      body.permisos,
    );
  }
}