import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne } from 'typeorm';
import { Event } from '../events/event.entity';

@Entity()
export class FileRecord {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    title: string;

    @Column()
    url: string;

    @Column({ default: false })
    is_public: boolean;

    @Column({ nullable: true })
    file_size: string;

    @CreateDateColumn()
    published_at: Date;

    @ManyToOne(() => Event, (event) => event.files, { onDelete: 'CASCADE' })
    event: Event;
}
