import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({
    description: 'Nombre del grupo',
    example: 'Desarrollo Backend',
  })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({
    description: 'Descripción del grupo',
    example: 'Equipo de desarrollo backend',
  })
  @IsString()
  @IsOptional()
  descripcion?: string;
}

export class UpdateGroupDto {
  @ApiPropertyOptional({
    description: 'Nombre del grupo',
    example: 'Nuevo nombre',
  })
  @IsString()
  @IsOptional()
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Descripción del grupo',
    example: 'Nueva descripción',
  })
  @IsString()
  @IsOptional()
  descripcion?: string;
}

export class AddMemberDto {
  @ApiProperty({
    description: 'UUID del usuario a agregar',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  @IsNotEmpty()
  usuario_id: string;
}

export class AssignPermissionDto {
  @ApiProperty({
    description: 'UUID del permiso',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  @IsNotEmpty()
  permiso_id: string;
}

export class AssignPermissionsDto {
  @ApiProperty({
    description: 'UUID del usuario al que se asignarán permisos',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  @IsNotEmpty()
  usuario_id: string;

  @ApiProperty({
    description: 'Array de UUIDs de permisos',
    example: ['f47ac10b-58cc-4372-a567-0e02b2c3d479'],
  })
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  permisos: string[];
}
