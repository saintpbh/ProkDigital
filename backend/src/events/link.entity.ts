import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Event } from './event.entity';

@Entity()
export class LinkRecord {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    title: string;

    @Column()
    url: string;

    @Column({ default: false })
    is_public: boolean;

    @CreateDateColumn()
    published_at: Date;

    @ManyToOne(() => Event, (event) => event.links, { onDelete: 'CASCADE' })
    event: Event;
}
