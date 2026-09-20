import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { ServiceEntity } from '../common/types';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { ErrorCodes } from '../common/errors/error-codes';

@Injectable()
export class ServicesService {
  constructor(private readonly firebaseService: FirebaseService) {}

  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }

  async findAll(includeInactive = false): Promise<ServiceEntity[]> {
    const services = await this.firebaseService.queryDocs<ServiceEntity>('services');
    if (includeInactive) {
      return services;
    }
    return services.filter((s) => s.active !== false);
  }

  async findById(id: string): Promise<ServiceEntity> {
    const service = await this.firebaseService.getDoc<ServiceEntity>('services', id);
    if (!service) {
      throw new NotFoundException({
        message: `Service with ID ${id} not found`,
        code: ErrorCodes.SERVICE_NOT_FOUND,
      });
    }
    return service;
  }

  async findBySlug(slug: string): Promise<ServiceEntity> {
    const services = await this.firebaseService.queryDocs<ServiceEntity>('services', {
      where: [['slug', '==', slug]],
      limit: 1,
    });

    if (!services.length) {
      throw new NotFoundException({
        message: `Service with slug ${slug} not found`,
        code: ErrorCodes.SERVICE_NOT_FOUND,
      });
    }
    return services[0];
  }

  async create(dto: CreateServiceDto): Promise<ServiceEntity> {
    const slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);
    
    // Check if slug already in use
    const existing = await this.firebaseService.queryDocs<ServiceEntity>('services', {
      where: [['slug', '==', slug]],
      limit: 1,
    });

    if (existing.length > 0) {
      throw new BadRequestException({
        message: `Service with slug "${slug}" already exists`,
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    const id = `svc_${Date.now()}`;
    const newService: ServiceEntity = {
      id,
      name: dto.name,
      slug,
      description: dto.description,
      durationMinutes: dto.durationMinutes,
      price: dto.price,
      currency: 'INR',
      active: dto.active ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.firebaseService.setDoc('services', id, newService);
    return newService;
  }

  async update(id: string, dto: UpdateServiceDto): Promise<ServiceEntity> {
    const service = await this.findById(id);

    const updates: Partial<ServiceEntity> = { ...dto };
    if (dto.name && !dto.slug) {
      updates.slug = this.slugify(dto.name);
    } else if (dto.slug) {
      updates.slug = this.slugify(dto.slug);
    }

    await this.firebaseService.updateDoc('services', id, updates);
    return { ...service, ...updates, updatedAt: new Date().toISOString() };
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.findById(id);
    await this.firebaseService.deleteDoc('services', id);
    return { id, deleted: true };
  }
}
